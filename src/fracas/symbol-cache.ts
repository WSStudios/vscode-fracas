import { fstat } from "fs";
import path = require("path");
import * as vscode from "vscode";
import { groupBy } from "../containers";
import {
    findProjectFiles
} from '../editor-lib'
import {
    findAllImportDefinitions,
    findProvidedIdentifiers,
    findLocalIdentifiers,
    findWorkspaceSymbols,
    partitionIdentifiersByVisibility
} from './syntax'

class FileState {
    constructor(
        public readonly stat: vscode.FileStat,
        public readonly importedPaths: string[],
        public readonly publicIdentifiers: string[],
        public readonly privateIdentifiers: string[])
    {}
}

function _fileStateKey(fsPath: string): string {
    return `fs@${fsPath}`;
}

function _identifierKey(identifier: string): string {
    return `id@${identifier}`;
}

function _importKey(importPath: string): string {
    return `imp@${importPath}`;
}

export class FracasSymbolCache {
    constructor(private storage: vscode.Memento) {}

    async updateAll(token?: vscode.CancellationToken): Promise<void> {
        // for (const key of this.storage.keys()) {
        //     this.storage.update(key, undefined);
        // }

        // collect fracas files currently in the project, and cache entries
        const fileUris = await findProjectFiles('**/*.frc', token);
        const identifiers = await findWorkspaceSymbols(undefined, token);
        const identifiersByFile = groupBy(identifiers, sym => sym.location.uri.fsPath, sym => sym.name);
        
        // remove cache entries for files that are gone
        const curPaths = new Set(fileUris.map(uri => uri.fsPath)) // the file path is the cache key
        const removed = this.getFilePaths().filter(cachedPath => !curPaths.has(cachedPath));
        for (const path of removed) {
            this.removeFileState(path);
        }
        
        // update missing and stale cache entries
        const CHUNK_SIZE = 50;
        while (fileUris.length > 0) {
            const chunk = fileUris.slice(Math.max(0, fileUris.length - CHUNK_SIZE));
            await Promise.all(chunk.map(uri => 
                this._refreshFileStateForUri(uri, identifiersByFile.get(uri.fsPath) ?? [], token)));
        }
     }

    getFilePaths(): string[] {
        return this.storage.keys().filter(key => key.startsWith('fs@'));
    }

    getIdentifiers(): string[] {
        return this.storage.keys().filter(key => key.startsWith('id@'));
    }

    hasFileState(path: string): boolean {
        return this.storage.keys().includes(_fileStateKey(path));
    }

    hasIdentifierPath(id: string): boolean {
        return this.storage.keys().includes(_identifierKey(id));
    }

    getFileState(path: string): FileState | undefined {
        return this.storage.get<FileState>(_fileStateKey(path));
    }

    getProvidedIdentifiers(path: string): string[] {
        const fileState = this.getFileState(path);
        return fileState?.publicIdentifiers ?? [];
    }

    getIdentifierPath(id: string): string | undefined {
        return this.storage.get<string>(_identifierKey(id));
    }

    getFileStateTimestamp(path: string): number {
        const entry = this.getFileState(path);
        return entry?.stat.mtime ?? 0
    }

    updateFileState(
        document: vscode.TextDocument, 
        stat: vscode.FileStat,
        publicIdentifiers: string[],
        privateIdentifiers: string[]
    ): void {
        this.removeFileState(document.fileName); // clear stale cache data

        const imports = findAllImportDefinitions(document);
        const importedPaths = imports.map(imp => imp.location.uri.fsPath);

        // cache reverse map of file identifiers
        for (const id of publicIdentifiers) {
            this._setFilePathForIdentifier(id, document.fileName);
        }

        const newFileState = new FileState(stat, importedPaths, publicIdentifiers, privateIdentifiers);
        this.storage.update(document.uri.fsPath, newFileState);
    }

    removeFileState(path: string): void {
        const entry = this.getFileState(path);
        // remove all identifiers for this file
        if (entry) {
            for (const id of entry.publicIdentifiers) {
                this.storage.update(_identifierKey(id), undefined);
            }
        }

        this.storage.update(path, undefined); // clear the entry.
    }

    getImportedIdentifiers(path: string): Set<string> {
        const identifiers = new Set<string>();
        
        const fileState = this.getFileState(path);
        if (fileState) {
            // add all identifiers -- provided/public or not provided/private -- in this file
            for (const identifier of fileState.publicIdentifiers) {
                identifiers.add(identifier);
            }
            for (const identifier of fileState.privateIdentifiers) {
                identifiers.add(identifier);
            }
            
            // recurse on all imported files
            const pathsSeen = new Set<string>(path);
            for (const importedPath of fileState.importedPaths) {
                this._getImportedIdentifiersRecursive(importedPath, pathsSeen, identifiers);
            }
        }

        return identifiers;
    }

    private _getImportedIdentifiersRecursive(path: string, pathsSeen: Set<string>, identifiers: Set<string>): void {
        // avoid infinite recursion
        if (pathsSeen.has(path)) {
            return;
        }
        pathsSeen.add(path);

        const fileState = this.getFileState(path);
        if (fileState) {
            // add all identifiers provided by this file
            for (const identifier of fileState.publicIdentifiers) {
                identifiers.add(identifier);
            }

            // recurse on all imported files
            for (const importedPath of fileState.importedPaths) {
                this._getImportedIdentifiersRecursive(importedPath, pathsSeen, identifiers);
            }
        }
    }

    getFilePathForIdentifier(identifier: string): string | undefined {
        return this.storage.get<string>(_identifierKey(identifier));
    }

    private _setFilePathForIdentifier(identifier: string, path: string): void {
        this.storage.update(_identifierKey(identifier), path);
    }

    private async _refreshFileStateForUri(
        uri: vscode.Uri, 
        identifiers: string[],
        token?: vscode.CancellationToken
    ): Promise<void> {
        const stat = await vscode.workspace.fs.stat(uri);
        if (!this.hasFileState(uri.fsPath) || stat.mtime > this.getFileStateTimestamp(uri.fsPath)) {
            const document = await vscode.workspace.openTextDocument(uri);
            const { publicIds, privateIds } = partitionIdentifiersByVisibility(document, identifiers);
            this.updateFileState(document, stat, publicIds, privateIds);
        }
    }
}


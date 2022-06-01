import * as vscode from 'vscode'; // The module 'vscode' contains the VS Code extensibility API
import { findDocumentSymbols, findWorkspaceSymbols } from './syntax';

export class FracasDocumentSymbolProvider 
implements vscode.DocumentSymbolProvider, vscode.WorkspaceSymbolProvider {
    provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken
    ): Promise<vscode.SymbolInformation[]> {
        return findDocumentSymbols(document.uri, token);
    }

    provideWorkspaceSymbols(query: string, token: vscode.CancellationToken
    ): Promise<vscode.SymbolInformation[]> {
        return findWorkspaceSymbols(query, token);
    }
}

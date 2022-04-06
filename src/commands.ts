import { diffChars } from "diff";
import * as path from "path";
import * as vscode from "vscode";
import {
    getFormatterScript,
    getNinja,
    getProjectDir, 
    getPython, 
    getRacketShellCmd
} from "./config";
import { getOrDefault } from "./containers";
import { getSelectedSymbol, withFilePath } from "./editor-lib";
import {
    createTerminal,
    runFileInTerminal,
    createRepl,
    loadFileInRepl,
    executeSelectionInRepl,
    withRepl,
} from "./repl";
import {
    execShell,
    openRacketReference,
    kebabCaseToPascalCase,
    withRacketShellCmd
} from "./utils";

export function helpWithSelectedSymbol(): void {
    const fracasObject = getSelectedSymbol();
    if (fracasObject) {
        openRacketReference(fracasObject);
    }
}

export function runInTerminal(terminals: Map<string, vscode.Terminal>): void {
    withRacketShellCmd((racketCmd: string) => {
        const document = vscode.window.activeTextEditor?.document;
        if (document) {
            document.save();
            const filePath = path.resolve(document.fileName);

            let terminal;
            if (
                vscode.workspace
                    .getConfiguration("vscode-fracas.outputTerminal")
                    .get("numberOfOutputTerminals") === "one"
            ) {
                terminal = getOrDefault(terminals, "one", () => createTerminal(null));
            } else {
                terminal = getOrDefault(terminals, filePath, () => createTerminal(filePath));
            }
            runFileInTerminal(racketCmd, filePath, terminal);
        }
    });
}

export function loadInRepl(repls: Map<string, vscode.Terminal>): void {
    withRacketShellCmd((racketCmd: string) => {
        const document = vscode.window.activeTextEditor?.document;
        if (document) {
            document.save();
            const filePath = path.resolve(document.fileName);

            const repl = getOrDefault(repls, filePath, () => createRepl(path.basename(filePath), racketCmd));
            loadFileInRepl(filePath, repl);
        }
    });
}

export async function executeSelection(repls: Map<string, vscode.Terminal>): Promise<void> {
    const filePath = vscode.window.activeTextEditor?.document?.fileName;
    if (filePath) {
        await withRepl(repls, filePath, executeSelectionInRepl);
    }
}

/**
 * finds all localized-text*.frc files, converts the filenames into .csv file
 * names, and invokes racket to generate TdpLocalization.cpp/h
 */
export async function makeStringTableImport(): Promise<void> {
    const racket = getRacketShellCmd();
    const stringTableCpp = vscode.workspace
        .getConfiguration("vscode-fracas.general")
        .get<string>("stringTableRegistryFile")
        || "..\\tdp1.unreal\\Source\\Data\\Private\\TdpLocalization.cpp";
    const projectDir = getProjectDir();
    const stringTableDestDir = vscode.workspace
        .getConfiguration("vscode-fracas.localization")
        .get<string>("stringTableDestDir") || ".";
    const stringTableSourcePaths = vscode.workspace
        .getConfiguration("vscode-fracas.localization")
        .get<string[]>("stringTableSourcePaths") || [];

    if (racket) {
        const textFrcFiles = [];
        for (const pathPattern of stringTableSourcePaths) {
            const glob = new vscode.RelativePattern(vscode.Uri.file(projectDir), pathPattern);
            textFrcFiles.push(...await vscode.workspace.findFiles(glob));
        }
        textFrcFiles.sort();
        const csvFiles = textFrcFiles.map(frcFile => {
            const csvBaseName = kebabCaseToPascalCase(path.basename(frcFile.fsPath, ".frc"));
            const csvFile = path.resolve(`${projectDir}\\${stringTableDestDir}\\${csvBaseName}.csv`);
            return csvFile;
        });

        console.log(`Generating ${textFrcFiles.length} text source files into "${stringTableCpp}"`);
        await execShell(`${racket} ../fracas/lib/fracas/make-string-table-import.rkt -- ${csvFiles.join(" ")}`);
    }
}

export async function compileFracasObject(filePath: string, fracasObject: string): Promise<void> {
    const racket = getRacketShellCmd();
    if (fracasObject && filePath && racket) {
        vscode.window.activeTextEditor?.document?.save();
        const cmd = `(require fracas/make-asset) (enter! (file "${filePath}")) (define-asset-impl: #:value ${fracasObject} #:value-name (quote ${fracasObject}) #:key (key: ${fracasObject}))`;
        await execShell(`${racket} -e "${cmd.replace(/"/g, '\\"')}"`);
    }
}

let lastFracasObject = "";
let lastFracasFile = "";
export function compileSelectedFracasObject(): void {
    lastFracasFile = vscode.window.activeTextEditor?.document?.fileName || "";
    lastFracasObject = getSelectedSymbol();
    compileFracasObject(lastFracasFile, lastFracasObject);
}

export function recompileFracasObject(): void {
    compileFracasObject(lastFracasFile, lastFracasObject);
}

export async function precompileFracasFile(frcDoc: vscode.TextDocument | undefined = undefined): Promise<void> {
    // use the open document if none is provided
    if (frcDoc === undefined) {
        frcDoc = vscode.window.activeTextEditor?.document;
    }

    // if there is a fracas document, precompile it
    if (frcDoc && frcDoc.languageId === "fracas") {
        frcDoc.save(); // save the document before precompiling

        const ninja = getNinja();

        // Invoke ninja to update all precompiled zo file dependencies
        console.log(`Precompiling fracas files because ${frcDoc.fileName} has changed`);
        const precompileNinjaFile = path.join("build", "build_precompile.ninja");
        const ninjaCmd = `"${ninja}" -f "${precompileNinjaFile}"`;
        console.log(ninjaCmd);
        await execShell(ninjaCmd);
    }
}

export function openRepl(repls: Map<string, vscode.Terminal>): void {
    withFilePath((filePath: string) => {
        withRacketShellCmd((racketCmd: string) => {
            const repl = getOrDefault(repls, filePath, () => createRepl(path.basename(filePath), racketCmd));
            repl.show();
        });
    });
}

export function showOutput(terminals: Map<string, vscode.Terminal>): void {
    withFilePath((filePath: string) => {
        const terminal = terminals.get(filePath);
        if (terminal) {
            terminal.show();
        } else {
            vscode.window.showErrorMessage("No output terminal exists for this file");
        }
    });
}

export async function formatDocument(frcDoc?: vscode.TextDocument, range?: vscode.Range)
: Promise<vscode.TextEdit[]> {
    // use the open document if none is provided
    if (frcDoc === undefined) {
        frcDoc = vscode.window.activeTextEditor?.document;
    }
    
    // VS Code document offsets count CRLF as one character, but the diff lib counts it as two.
    function lengthWithoutCR(text: string): number {
        let len = 0;
        for (let i = 0; i < text.length; i++) {
            if (text.charAt(i) !== "\r") {
                len++;
            }
        }
        return len;
    }

    // // extend range an extra character to include changes appended at the end
    // if (range) {
    //     range = new vscode.Range(range.start, range.end.translate(0, 1));
    // }

    // if there is a fracas document, format it
    if (frcDoc !== undefined) {
        // Invoke yasi to generate formatted text.
        const formatCmd = `"${getPython()}" "${getFormatterScript()}" --no-modify "${frcDoc.fileName}"`;
        console.log(formatCmd);
        const preFormattedText = await execShell(formatCmd, frcDoc.getText());
        if (!preFormattedText) {
            return [];
        }

        // normalize line endings
        const formattedText = frcDoc.eol === vscode.EndOfLine.LF ?
            preFormattedText.replace(/\r\n/g, "\n") :
            preFormattedText.replace(/\r\r?\n/g, "\r\n");

        // compute diff and convert to vscode edits
        const changes = diffChars(frcDoc.getText(), formattedText);
        const edits: vscode.TextEdit[] = [];
        let offset = 0;
        for (const change of changes) {
            const position = frcDoc.positionAt(offset);
            if (range === undefined || range.contains(position)) {
                if (change.added) {
                    edits.push(vscode.TextEdit.insert(position, change.value));
                } else if (change.removed) {
                    edits.push(vscode.TextEdit.delete(
                        new vscode.Range(position, frcDoc.positionAt(offset + change.value.length))));
                }
            }

            if (!change.removed && !change.added) {
                offset += lengthWithoutCR(change.value);
            }
        }

        return edits;
    }

    return [];
}

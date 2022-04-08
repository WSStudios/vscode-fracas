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
import {
    getSelectedSymbol,
    diffToTextEdits,
    withFilePath
} from "./editor-lib";
import { findEnclosingExpression } from "./fracas/syntax";
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
        ?? "..\\tdp1.unreal\\Source\\Data\\Private\\TdpLocalization.cpp";
    const projectDir = getProjectDir();
    const stringTableDestDir = vscode.workspace
        .getConfiguration("vscode-fracas.localization")
        .get<string>("stringTableDestDir") ?? ".";
    const stringTableSourcePaths = vscode.workspace
        .getConfiguration("vscode-fracas.localization")
        .get<string[]>("stringTableSourcePaths") ?? [];

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
    lastFracasFile = vscode.window.activeTextEditor?.document?.fileName ?? "";
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

export async function formatFracasDocument(
    frcDoc?: vscode.TextDocument, 
    options?: vscode.FormattingOptions,
    range?: vscode.Range
): Promise<vscode.TextEdit[]> {
    // use the open document if none is provided
    if (frcDoc === undefined) {
        frcDoc = vscode.window.activeTextEditor?.document;
    }

    // if there is a fracas document, format it
    if (frcDoc !== undefined) {
        // Expand selection range to a valid expression
        if (range) {
            range = findEnclosingExpression(frcDoc, range);
        }

        // Invoke yasi to generate formatted text.
        const indent = options?.tabSize ?? 2;
        const formatCmd = `"${getPython()}" "${getFormatterScript()}" --diff --indent-size ${indent}`;
        console.log(formatCmd);
        const diff = await execShell(formatCmd, frcDoc.getText(range) + "\n");

        // convert diff to text edits and move them to the correct position
        if (diff) {
            const newline = frcDoc.eol === vscode.EndOfLine.LF ? "\n" : "\r\n";
            const edits = diffToTextEdits(diff, newline);
            if (range) {
                _translateEditsBy(edits, range.start, newline);
            }
            return edits;
        }
    }

    return [];
}

function _translateEditsBy(edits: vscode.TextEdit[], offset: vscode.Position, newline = "\r\n"
): void {
    // offset the edits by the offset
    const exprIndent = " ".repeat(offset.character);
    for (const edit of edits) {
        // Offset the text edits to the position of the selected expression
        edit.range = new vscode.Range(
            edit.range.start.translate(offset.line, offset.character),
            edit.range.end.translate(offset.line, offset.character));
        // Indent the text edit lines to match the selected expression
        if (exprIndent.length > 0) {
            edit.newText = edit.newText
                .split(newline)
                .map(line => exprIndent + line) // prepend the indent to each line
                .join(newline)
                .substring(exprIndent.length); // drop indent from first line, which is already indented.
        }
    }
}

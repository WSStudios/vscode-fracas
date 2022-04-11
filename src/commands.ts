import * as path from "path";
import * as vscode from "vscode";
import * as config from "./config";
import { getOrDefault } from "./containers";
import * as editorLib from "./editor-lib";
import { findEnclosingExpression } from "./fracas/syntax";
import * as repl from "./repl";
import * as utils from "./utils";

export function helpWithSelectedSymbol(): void {
    const fracasObject = editorLib.getSelectedSymbol();
    if (fracasObject) {
        utils.openRacketReference(fracasObject);
    }
}

export function runInTerminal(terminals: Map<string, vscode.Terminal>): void {
    utils.withRacketShellCmd((racketCmd: string) => {
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
                terminal = getOrDefault(terminals, "one", () => repl.createTerminal(null));
            } else {
                terminal = getOrDefault(terminals, filePath, () => repl.createTerminal(filePath));
            }
            repl.runFileInTerminal(racketCmd, filePath, terminal);
        }
    });
}

export function loadInRepl(repls: Map<string, vscode.Terminal>): void {
    utils.withRacketShellCmd((racketCmd: string) => {
        const document = vscode.window.activeTextEditor?.document;
        if (document) {
            document.save();
            const filePath = path.resolve(document.fileName);

            const replTerminal = getOrDefault(repls, filePath, () => repl.createRepl(path.basename(filePath), racketCmd));
            repl.loadFileInRepl(filePath, replTerminal);
        }
    });
}

export async function executeSelection(repls: Map<string, vscode.Terminal>): Promise<void> {
    const filePath = vscode.window.activeTextEditor?.document?.fileName;
    if (filePath) {
        await repl.withRepl(repls, filePath, repl.executeSelectionInRepl);
    }
}

/**
 * finds all localized-text*.frc files, converts the filenames into .csv file
 * names, and invokes racket to generate TdpLocalization.cpp/h
 */
export async function makeStringTableImport(): Promise<void> {
    const racket = config.getRacketShellCmd();
    const stringTableCpp = vscode.workspace
        .getConfiguration("vscode-fracas.general")
        .get<string>("stringTableRegistryFile")
        ?? "..\\tdp1.unreal\\Source\\Data\\Private\\TdpLocalization.cpp";
    const projectDir = config.getProjectDir();
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
            const csvBaseName = utils.kebabCaseToPascalCase(path.basename(frcFile.fsPath, ".frc"));
            const csvFile = path.resolve(`${projectDir}\\${stringTableDestDir}\\${csvBaseName}.csv`);
            return csvFile;
        });

        console.log(`Generating ${textFrcFiles.length} text source files into "${stringTableCpp}"`);
        await utils.execShell(`${racket} ../fracas/lib/fracas/make-string-table-import.rkt -- ${csvFiles.join(" ")}`);
    }
}

export async function compileFracasObject(filePath: string, fracasObject: string): Promise<void> {
    const racket = config.getRacketShellCmd();
    if (fracasObject && filePath && racket) {
        vscode.window.activeTextEditor?.document?.save();
        const cmd = `(require fracas/make-asset) (enter! (file "${filePath}")) (define-asset-impl: #:value ${fracasObject} #:value-name (quote ${fracasObject}) #:key (key: ${fracasObject}))`;
        await utils.execShell(`${racket} -e "${cmd.replace(/"/g, '\\"')}"`);
    }
}

let lastFracasObject = "";
let lastFracasFile = "";
export function compileSelectedFracasObject(): void {
    lastFracasFile = vscode.window.activeTextEditor?.document?.fileName ?? "";
    lastFracasObject = editorLib.getSelectedSymbol();
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

        const ninja = config.getNinja();

        // Invoke ninja to update all precompiled zo file dependencies
        console.log(`Precompiling fracas files because ${frcDoc.fileName} has changed`);
        const precompileNinjaFile = path.join("build", "build_precompile.ninja");
        const ninjaCmd = `"${ninja}" -f "${precompileNinjaFile}"`;
        console.log(ninjaCmd);
        await utils.execShell(ninjaCmd);
    }
}

export function openRepl(repls: Map<string, vscode.Terminal>): void {
    editorLib.withFilePath((filePath: string) => {
        utils.withRacketShellCmd((racketCmd: string) => {
            const replTerminal = getOrDefault(repls, filePath, () => repl.createRepl(path.basename(filePath), racketCmd));
            replTerminal.show();
        });
    });
}

export function showOutput(terminals: Map<string, vscode.Terminal>): void {
    editorLib.withFilePath((filePath: string) => {
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
    range?: vscode.Range | vscode.Position
): Promise<vscode.TextEdit[]> {
    // use the open document if none is provided
    if (frcDoc === undefined) {
        frcDoc = vscode.window.activeTextEditor?.document;
    }

    // if there is a fracas document, format it
    if (frcDoc !== undefined) {
        // Expand selection range to a valid expression
        if (range) {
            range = editorLib.resolveRange(range);
            // console.log(frcDoc.getText(range) + "\n");
            range = findEnclosingExpression(frcDoc, range);
            if (!range || range.isEmpty) {
                return [];
            }
        }

        // Invoke yasi to generate formatted text.
        const fracasText = frcDoc.getText(range);
        const indent = options?.tabSize ?? 2;
        const formatCmd = `"${config.getPython()}" "${config.getFormatterScript()}" --diff --indent-size ${indent}`;
        // console.log(fracasText);
        console.log(formatCmd);
        const diff = await utils.execShell(formatCmd, fracasText.endsWith("\n") ? fracasText : fracasText + "\n");

        // convert diff to text edits and move them to the correct position
        if (diff) {
            const newline = frcDoc.eol === vscode.EndOfLine.LF ? "\n" : "\r\n";
            const edits = editorLib.diffToTextEdits(diff, newline);
            if (range && range.start.isAfter(new vscode.Position(0, 0))) {
                _textEditsToDocumentEdits(fracasText, edits, frcDoc, range.start, newline);
            }
            return edits;
        }
    }

    return [];
}

function _textEditsToDocumentEdits(
    editedText: string,
    textEdits: vscode.TextEdit[], 
    document: vscode.TextDocument,
    documentPos: vscode.Position, 
    newline = "\r\n"
): void {
    // offset the edits by the offset
    const exprIndent = " ".repeat(documentPos.character);
    const editRanges = textEdits.map(edit => edit.range);
    // Translate text edit offsets to the position of the selected expression
    const documentRanges = editorLib.textRangesToDocumentRanges(editedText, editRanges, newline, document, documentPos);
    
    for (let index = 0; index < textEdits.length; index++) {
        const edit = textEdits[index];
        edit.range = documentRanges[index];
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

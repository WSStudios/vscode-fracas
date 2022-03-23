import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
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
    getRacket, 
    openRacketReference, 
    kebabCaseToPascalCase, 
    withRacket 
} from "./utils";

export function helpWithSelectedSymbol(): void {
    const fracasObject = getSelectedSymbol();
    if (fracasObject) {
        openRacketReference(fracasObject);
    }
}

export function runInTerminal(terminals: Map<string, vscode.Terminal>): void {
    withRacket((racket: string, racketArgs: string[]) => {
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
            runFileInTerminal(racket, racketArgs, filePath, terminal);
        }
    });
}

export function loadInRepl(repls: Map<string, vscode.Terminal>): void {
    withRacket((racket: string, racketArgs: string[]) => {
        const document = vscode.window.activeTextEditor?.document;
        if (document) {
            document.save();
            const filePath = path.resolve(document.fileName);

            const repl = getOrDefault(repls, filePath, () => createRepl(path.basename(filePath), racket, racketArgs));
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
    const [racket, racketArgs] = getRacket();
    const stringTableCpp = vscode.workspace
        .getConfiguration("vscode-fracas.general")
        .get<string>("stringTableRegistryFile") 
        || "..\\tdp1.unreal\\Source\\Data\\Private\\TdpLocalization.cpp";
    const projectDir = vscode.workspace
        .getConfiguration("vscode-fracas.general")
        .get<string>("projectDir") || ".";
    const stringTableDestDir = vscode.workspace
        .getConfiguration("vscode-fracas.localization")
        .get<string>("stringTableDestDir") || ".";
    const stringTableSourcePaths = vscode.workspace
        .getConfiguration("vscode-fracas.localization")
        .get<string[]>("stringTableSourcePaths") || [];

    if (racket) 
    {
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
        execShell(`${racket} ${racketArgs.join(" ")} ../fracas/lib/fracas/make-string-table-import.rkt -- ${csvFiles.join(" ")}`);
    }
}

export function compileFracasObject(filePath: string, fracasObject: string): void {
    const [racket, racketArgs] = getRacket();
    if (fracasObject && filePath && racket) {
        vscode.window.activeTextEditor?.document?.save();
        const cmd = `(require fracas/make-asset) (enter! (file "${filePath}")) (define-asset-impl: #:value ${fracasObject} #:value-name (quote ${fracasObject}) #:key (key: ${fracasObject}))`;
        execShell(`${racket} ${racketArgs.join(" ")} -e "${cmd.replace(/"/g, '\\"')}"`);
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

export function precompileFracasFile(frcDoc: vscode.TextDocument | undefined = undefined): void {
    // use the open document if none is provided
    if (frcDoc === undefined) {
        frcDoc = vscode.window.activeTextEditor?.document;
    }

    // if there is a fracas document, precompile it
    if (frcDoc && frcDoc.languageId === "fracas") {
        frcDoc.save(); // save the document before precompiling
        
        const ninja = vscode.workspace
            .getConfiguration("vscode-fracas.general")
            .get<string>("ninjaPath") || "ninja";
        
        // Invoke ninja to update all precompiled zo file dependencies
        console.log(`Precompiling fracas files because ${frcDoc.fileName} has changed`);
        const ninjaCmd = `${ninja} -f ./build/build_precompile.ninja`;
        console.log(ninjaCmd);
        execShell(ninjaCmd);
    }
}

export function openRepl(repls: Map<string, vscode.Terminal>): void {
    withFilePath((filePath: string) => {
        withRacket((racket: string, racketArgs: string[]) => {
            const repl = getOrDefault(repls, filePath, () => createRepl(path.basename(filePath), racket, racketArgs));
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

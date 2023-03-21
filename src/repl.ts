import path = require("path");
import * as vscode from "vscode";
import { getRacketShellCmd } from "./config";
import { asyncGetOrDefault } from "./containers";
import { delay } from "./utils";

export async function withRepl(
    repls: Map<string, vscode.Terminal>,
    replKey: string,
    callback: (terminal: vscode.Terminal, editor: vscode.TextEditor) => void,
): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const racketCmd = getRacketShellCmd();
    if (replKey && editor && racketCmd) {
        const repl = await asyncGetOrDefault(repls, replKey, async () => {
            const newRepl = createRepl(replKey, racketCmd);
            await delay(3000); // allow for repl to start
            return newRepl;
        });
        callback(repl, editor);
    }
}


export function executeSelectionInRepl(repl: vscode.Terminal, editor: vscode.TextEditor): void {
    repl.show();
    editor.selections.forEach((sel) => {
        const trimmed = editor.document.getText(sel).trim();
        if (trimmed) {
            repl.sendText(trimmed);
        }
    });
}

export function runFileInTerminal(
    racketCmd: string,
    filePath: string,
    terminal: vscode.Terminal,
): void {
    terminal.show();
    if (process.platform === "win32") {
        // cmd.exe doesn't recognize single quotes
        terminal.sendText(`${racketCmd} "${filePath}"`);
    } else {
        terminal.sendText("clear");
        terminal.sendText(`${racketCmd} '${filePath}'`);
    }
}

export function loadFileInRepl(filePath: string, repl: vscode.Terminal): void {
    repl.show();
    repl.sendText(`(enter! (file "${filePath.replaceAll('\\','/')}"))`);
}

export function createTerminal(filePath: string | null): vscode.Terminal {
    const shell = process.platform === "win32" ? "cmd.exe" : undefined;
    let terminal;
    if (filePath) {
        const templateSetting: string | undefined = vscode.workspace
            .getConfiguration("vscode-fracas.outputTerminal")
            .get("outputTerminalTitle");
        const template = templateSetting && templateSetting !== "" ? templateSetting : "Output ($name)";
        terminal = vscode.window.createTerminal(template.replace("$name", path.basename(filePath)), shell);
    } else {
        const templateSetting: string | undefined = vscode.workspace
            .getConfiguration("vscode-fracas.outputTerminal")
            .get("sharedOutputTerminalTitle");
        const template = templateSetting && templateSetting !== "" ? templateSetting : "Racket Output";
        terminal = vscode.window.createTerminal(template, shell);
    }
    terminal.show();
    return terminal;
}

export function createRepl(replKey: string, racketCmd: string): vscode.Terminal {
    const templateSetting: string | undefined = vscode.workspace
        .getConfiguration("vscode-fracas.repl")
        .get("replTitle");
    const template = templateSetting ?? "REPL ($name)";
    const shell = process.platform === "win32" ? "cmd.exe" : undefined;
    const repl = vscode.window.createTerminal(template.replace("$name", replKey), shell);
    repl.show();
    repl.sendText(racketCmd);
    return repl;
}

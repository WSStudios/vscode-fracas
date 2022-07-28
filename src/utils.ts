import * as vscode from "vscode";
import * as cp from "child_process";
import { fracasOut, getProjectDir, getRacket, getRacketShellCmd } from "./config";
import stream = require("stream");

export interface ExecOptions {
    input?: string;
    workingDir?: string;
    showErrors: boolean;
    timeoutMillis: number;
}

export function execShell(
    cmd: string,
    options: ExecOptions = { showErrors: true, workingDir: getProjectDir(), timeoutMillis: 60_000 },
    token?: vscode.CancellationToken
) : Promise<string> {
    fracasOut.appendLine(`From working dir: '${options.workingDir}'`);
    fracasOut.appendLine(`Executing: '${cmd}'`);
    return new Promise<string>((resolve, reject) => {
        const child = cp.exec(cmd,
            { cwd: options.workingDir, timeout: options.timeoutMillis },
            (err, out) => {
                if (err) {
                    if (options.showErrors) {
                        vscode.window.showErrorMessage(err.message + "\n" + out);
                    }
                    fracasOut.appendLine(`Command failed '${cmd}':`);
                    fracasOut.appendLine(`${err.name}: ${err.message}`);
                    if (err.stack) {
                        fracasOut.appendLine(err.stack);
                    }
                    return reject(err);
                }
                return resolve(out);
            });

        // Kill the child process if the token is cancelled
        token?.onCancellationRequested(() => child.kill());

        // if an input is given, pipe it to the child process
        if (options.input && child.stdin) {
            const stdinStream = new stream.Readable();
            stdinStream.push(options.input);  // Add data to the internal queue for users of the stream to consume
            stdinStream.push(null);   // Signals the end of the stream (EOF)
            stdinStream.pipe(child.stdin);
        }
    });
}

export function execShellWithProgress(
    cmd: string,
    title: string,
    options: ExecOptions = { showErrors: true, workingDir: getProjectDir(), timeoutMillis: 60_000 }
) : Thenable<string> {
    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        cancellable: true,
        title: title
    }, async (progress, token) => {
        progress.report({  increment: 25 });
        const output = await execShell(cmd, options, token);
        progress.report({ increment: 100 });
        return output;
    });
}

export function kebabCaseToPascalCase(input: string): string
{
  return input
    .split("-")
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .reduce((camel, word, index) => {
        const pascalWord = word.substring(1).toLowerCase();
        return `${camel}${word.charAt(0).toUpperCase()}${pascalWord}`;
    }, "");
}

export function openRacketReference(symbol: string): void {
    vscode.env.openExternal(vscode.Uri.parse(`https://docs.racket-lang.org/search/index.html?q=${encodeURI(symbol)}`));
}

export function delay(ms: number) : Promise<void> {
    return new Promise( resolve => setTimeout(resolve, ms) );
}

export function withRacket(func: (racketPath: string, racketArgs: string[]) => void, server = false): void {
    const [racket, racketArgs] = getRacket(server);
    if (racket) {
        func(racket, racketArgs);
    }
}

export function withRacketShellCmd(func: (racketCmd: string) => void, server = false): void {
    const racketCmd = getRacketShellCmd(server);
    if (racketCmd) {
        func(racketCmd);
    }
}

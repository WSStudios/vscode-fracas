import * as vscode from "vscode";
import * as path from "path";
import { LanguageClient, LanguageClientOptions } from "vscode-languageclient/node";
import * as com from "./commands";
import * as ue4 from "./ue4";
import { withRacket } from "./utils";
import { FracasCompletionItemProvider } from './fracas/completion-item-provider';
import { FracasDefinitionProvider } from './fracas/definition-provider';
import { fracasDocumentFilter } from "./fracas/document-filter";
import { FracasReferenceProvider } from "./fracas/reference-provider";
import { FracasDocumentSymbolProvider } from "./fracas/document-symbol-provider";
import { FracasHoverProvider } from "./fracas/hover-provider";

let langClient: LanguageClient;
let isLangClientRunning = false;

export function deactivate(): Promise<void> {
    if (!langClient) {
        return Promise.reject(new Error("There is no language server client to be deactivated"));
    }
    return langClient.stop();
}

function setupLSP() {
    withRacket((racket: string, racketArgs: string[]) => {
        const executable = {
            command: racket,
            args: racketArgs.concat("--lib", "racket-langserver"),
        };

        // If the extension is launched in debug mode then the debug server options are used
        // Otherwise the run options are used
        const serverOptions = {
            run: executable,
            debug: executable,
        };

        // Options to control the language client
        const clientOptions: LanguageClientOptions = {
            // Register the server for racket documents
            documentSelector: [{ scheme: "file", language: "racket" }],
            synchronize: {
                // Notify the server about file changes to '.clientrc files contained in the workspace
                fileEvents: vscode.workspace.createFileSystemWatcher("**/.clientrc"),
            },
            uriConverters: {
                code2Protocol: (uri) => uri.toString(true),
                protocol2Code: (str) => vscode.Uri.parse(str),
            },
        };

        console.log(`Starting language server with ${executable.command} ${executable.args.join(" ")}`);

        // Create the language client and start the client.
        langClient = new LanguageClient(
            "vscode-fracas",
            "Racket Language Client",
            serverOptions,
            clientOptions,
        );
    }, true);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function reg(name: string, func: (...args: any[]) => any) {
    return vscode.commands.registerCommand(`vscode-fracas.${name}`, func);
}

function configurationChanged() {
    const enableLSP: boolean = vscode.workspace
        .getConfiguration("vscode-fracas.lsp")
        .get("enabled", true);

    if (langClient) {
        if (enableLSP && !isLangClientRunning) {
            langClient.start();
            isLangClientRunning = true;
        } else if (!enableLSP && isLangClientRunning) {
            langClient.stop();
            isLangClientRunning = false;
        }
    }
}

export function activate(context: vscode.ExtensionContext): void {
    setupLSP();
    configurationChanged();

    // Each file has one output terminal and one repl
    // Those two are saved in terminals and repls, respectively
    // The file is _ran_ in the terminal and _loaded_ into a repl
    const terminals: Map<string, vscode.Terminal> = new Map();
    const repls: Map<string, vscode.Terminal> = new Map();

    vscode.workspace.onDidChangeConfiguration(configurationChanged);
    
    // precompile fracas every time a file is saved
    function _maybeUpdateStringTables(uris: readonly vscode.Uri[]): void {
        if (uris.some(uri => {
            const fileName = path.basename(uri.path);
            return fileName.startsWith("localized-text") && fileName.endsWith(".frc");
        })) {
            com.makeStringTableImport();
        }
    }
    vscode.workspace.onDidSaveTextDocument(document => {
        if (document && document.languageId === "fracas") {
            com.precompileFracasFile(document);
            _maybeUpdateStringTables([document.uri]);
        }
    });
    vscode.workspace.onDidDeleteFiles(e => _maybeUpdateStringTables(e.files));
    vscode.workspace.onDidCreateFiles(e => _maybeUpdateStringTables(e.files));
    vscode.workspace.onDidRenameFiles(e => _maybeUpdateStringTables(
        e.files.map(f => f.newUri).concat(e.files.map(f => f.oldUri))));

    vscode.window.onDidCloseTerminal((terminal) => {
        terminals.forEach((val, key) => val === terminal && terminals.delete(key) && val.dispose());
        repls.forEach((val, key) => val === terminal && repls.delete(key) && val.dispose());
    });

    // Register RACKET commands
    context.subscriptions.push(
        reg("compileSelectedFracasObject", () => com.compileSelectedFracasObject()),
        reg("recompileFracasObject", () => com.recompileFracasObject()),
        reg("precompileFracasFile", () => com.precompileFracasFile()),
        reg("makeStringTableImport", () => com.makeStringTableImport()),
        reg("loadFileInRepl", () => com.loadInRepl(repls)),
        reg("runFile", () => com.runInTerminal(terminals)),
        reg("executeSelectionInRepl", () => com.executeSelection(repls)),
        reg("openRepl", () => com.openRepl(repls)),
        reg("showOutputTerminal", () => com.showOutput(terminals)),
        reg("helpWithSelectedSymbol", () => com.helpWithSelectedSymbol()),
        reg("ue4OpenAsset", () => ue4.ue4OpenEditorForAsset()));

    // Register FRACAS language support
    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(fracasDocumentFilter, new FracasDefinitionProvider()));
    context.subscriptions.push(
        vscode.languages.registerReferenceProvider(fracasDocumentFilter, new FracasReferenceProvider()));
    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider(fracasDocumentFilter, new FracasDocumentSymbolProvider()));
    context.subscriptions.push(
        vscode.languages.registerHoverProvider(fracasDocumentFilter, new FracasHoverProvider()));
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(fracasDocumentFilter, new FracasCompletionItemProvider()));

}

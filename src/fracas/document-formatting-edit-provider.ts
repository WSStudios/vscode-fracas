/* eslint-disable @typescript-eslint/no-unused-vars */
import * as vscode from 'vscode';
import { formatFracasDocument } from '../commands';

export class FracasDocumentFormattingEditProvider implements
    vscode.DocumentFormattingEditProvider,
    vscode.DocumentRangeFormattingEditProvider,
    vscode.OnTypeFormattingEditProvider {

    provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.TextEdit[]> {
        return formatFracasDocument(document, options);
    }

    provideDocumentRangeFormattingEdits(
        document: vscode.TextDocument,
        range: vscode.Range,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.TextEdit[]> {
        // If nothing is selected when you format, vs code passes the range for the entire
        // line. This interferes with the fracas formatter's ability to find the enclosing
        // expression to format, so we collapse empty selections to the cursor position.
        const editor = vscode.window?.activeTextEditor;
        if (editor?.document === document && editor.selection.isEmpty) {
            range = new vscode.Range(editor.selection.active, editor.selection.active);
        }
        return formatFracasDocument(document, options, range);
    }

    provideOnTypeFormattingEdits(
        document: vscode.TextDocument, 
        position: vscode.Position, 
        ch: string, 
        options: vscode.FormattingOptions, 
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.TextEdit[]> {
        // nudge position inside the expression
        return formatFracasDocument(document, options, position.translate(0, -1)); 
    }
}

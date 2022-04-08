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
        return formatFracasDocument(document, options, range);
    }

    provideOnTypeFormattingEdits(
        document: vscode.TextDocument, 
        position: vscode.Position, 
        ch: string, 
        options: vscode.FormattingOptions, 
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.TextEdit[]> {
        throw new Error('Method not implemented.');
    }
}

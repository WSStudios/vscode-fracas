import * as vscode from 'vscode';
import { formatFile } from '../commands';

export class FracasDocumentFormattingEditProvider implements vscode.DocumentFormattingEditProvider {
    provideDocumentFormattingEdits(document: vscode.TextDocument, options: vscode.FormattingOptions, token: vscode.CancellationToken)
    : vscode.ProviderResult<vscode.TextEdit[]> {
        return formatFile(document);
    }
}

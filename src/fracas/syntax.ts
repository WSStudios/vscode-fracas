import path = require('path');
import * as vscode from 'vscode';
import { fracasOut, getProjectFolder } from '../config';
import { flatten, mapAsync, uniqBy } from '../containers';
import {
    findTextInFiles,
    getRange,
    getSelectedSymbol,
    resolvePosition,
    resolveRange,
    resolveSelection,
    resolveSymbol,
    searchBackward
} from '../editor-lib';
import {
    matchAll,
    regexGroupDocumentLocation,
    regexGroupUriLocation
} from '../regular-expressions';
import {
    anyConstructorRx,
    anyDefineRx,
    anyDefineSymbolRx,
    anyEnumSymbolRx,
    anyFieldDeclarationRx,
    anyFieldSymbolDeclarationRx,
    anyIdentifierRx,
    anyMaskOrEnumRx,
    anyMaskSymbolRx,
    anyNamedParamDeclarationRx,
    anyNamedParamSymbolDeclarationRx,
    anySymbolRx,
    definePartialSymbolRx,
    enumMemberRx,
    importExpressionRx,
    importKeywordRx,
    provideKeywordRx,
    RX_ALL_DEFINED_OUT,
    RX_COMMENT,
    RX_EXCEPT_OUT,
    RX_IDENTIFIER,
    RX_PROVIDED_EXPRESSION,
    SearchKind,
    variantOptionRx,
} from './syntax-regex';

const KEYWORD_PREFIX = '#:';

export enum FracasDefinitionKind {
    enum,
    enumMember,
    gameData,
    key,
    text,
    mask,
    maskMember,
    typeOptional,
    type,
    variant,
    variantOption,
    syntax,
    define,
    keyword,
    import,
    unknown
}

export class FracasDefinition {
    /**
     * @param location - The location of the definition.
     * @param symbol - The name of the type defined by this definition.
     * @param kind - The type of definition -- enum, variant, mask, etc.
     * @param completionKind - The kind of the item for intellisense auto-completion.
     */
     constructor(
        readonly location: vscode.Location, 
        readonly symbol: string, 
        readonly kind: FracasDefinitionKind,
        readonly completionKind: vscode.CompletionItemKind = completionItemKind(kind))
    {
    }
}

export function definitionKind(defToken: string): FracasDefinitionKind {
    switch (defToken) {
        case 'define-enum':
            return FracasDefinitionKind.enum;
        case 'define-game-data':
            return FracasDefinitionKind.gameData;
        case 'define-key':
            return FracasDefinitionKind.key;
        case 'define-text':
            return FracasDefinitionKind.text;
        case 'define-string-table':
            return FracasDefinitionKind.text;
        case 'define-mask':
            return FracasDefinitionKind.mask;
        case 'define-type-optional':
            return FracasDefinitionKind.typeOptional;
        case 'define-syntax':
            return FracasDefinitionKind.syntax;
        case 'define-syntax-rule':
            return FracasDefinitionKind.syntax;
        case 'define-type':
            return FracasDefinitionKind.type;
        case 'define-variant':
            return FracasDefinitionKind.variant;
        case 'define':
            return FracasDefinitionKind.define;
        case 'define-list':
            return FracasDefinitionKind.define;
        case 'import':
        case 'import+export':
            return FracasDefinitionKind.import;
        default:
            return FracasDefinitionKind.unknown;
    }
}

export function definitionMemberKind(typeKind: FracasDefinitionKind): FracasDefinitionKind {
    switch (typeKind) {
        case FracasDefinitionKind.enum:
            return FracasDefinitionKind.enumMember;
        case FracasDefinitionKind.mask:
            return FracasDefinitionKind.maskMember;
        case FracasDefinitionKind.variant:
            return FracasDefinitionKind.variantOption;
        default:
            return FracasDefinitionKind.keyword;
    }
}

export function completionItemKind(fracasKind: FracasDefinitionKind): vscode.CompletionItemKind {
    switch (fracasKind) {
        case (FracasDefinitionKind.enum):
        case (FracasDefinitionKind.mask):
                return vscode.CompletionItemKind.Enum;
        case (FracasDefinitionKind.enumMember):
        case (FracasDefinitionKind.maskMember):
                return vscode.CompletionItemKind.EnumMember;
        case (FracasDefinitionKind.gameData):
            return vscode.CompletionItemKind.Module;
        case (FracasDefinitionKind.key):
        case (FracasDefinitionKind.text):
            return vscode.CompletionItemKind.Variable;
        case (FracasDefinitionKind.typeOptional):
        case (FracasDefinitionKind.type):
        case (FracasDefinitionKind.variant):
        case (FracasDefinitionKind.variantOption):
            return vscode.CompletionItemKind.Struct;
        case (FracasDefinitionKind.syntax):
            return vscode.CompletionItemKind.Unit;
        case (FracasDefinitionKind.define):
            return vscode.CompletionItemKind.Function;
        case (FracasDefinitionKind.keyword):
            return vscode.CompletionItemKind.Keyword;
        case (FracasDefinitionKind.import):
            return vscode.CompletionItemKind.Module;
        case (FracasDefinitionKind.unknown):
        default:
            return vscode.CompletionItemKind.Unit;
    }
}

export function symbolKind(fracasKind: FracasDefinitionKind): vscode.SymbolKind {
    switch (fracasKind) {
        case (FracasDefinitionKind.enum):
        case (FracasDefinitionKind.mask):
                return vscode.SymbolKind.Enum;
        case (FracasDefinitionKind.enumMember):
        case (FracasDefinitionKind.maskMember):
                return vscode.SymbolKind.EnumMember;
        case (FracasDefinitionKind.gameData):
            return vscode.SymbolKind.Module;
        case (FracasDefinitionKind.key):
        case (FracasDefinitionKind.text):
            return vscode.SymbolKind.Variable;
        case (FracasDefinitionKind.typeOptional):
        case (FracasDefinitionKind.type):
        case (FracasDefinitionKind.variant):
        case (FracasDefinitionKind.variantOption):
            return vscode.SymbolKind.Struct;
        case (FracasDefinitionKind.syntax):
            return vscode.SymbolKind.Operator;
        case (FracasDefinitionKind.define):
            return vscode.SymbolKind.Function;
        case (FracasDefinitionKind.keyword):
            return vscode.SymbolKind.Field;
        case (FracasDefinitionKind.import):
            return vscode.SymbolKind.File;
        case (FracasDefinitionKind.unknown):
        default:
            return vscode.SymbolKind.Null;
    }
}


/**
 * Get the nesting depth at which members are declared for a fracas type definition (e.g., enum, variant, type, etc.).
 * For example, the following fracas type definition has two open parens before the first member, max-targets:
 * (define-type targeting-data
 *   ((max-targets int #:default -1)
 *    (gather targeting-gather)
 *    ; snip
 *   )
 * )
 * ... but a variant definition has only one open paren:
 * (define-variant action (movement-modifier-add ... ))
 * @param fracasKind The fracas type in which members are declared.
 * @returns The nesting depth at which to search for member declarations.
 */
function _memberScopeDepth(fracasKind: FracasDefinitionKind): vscode.CompletionItemKind {
    switch (fracasKind) {
        case (FracasDefinitionKind.define):
        case (FracasDefinitionKind.import):
            return 0;
        case (FracasDefinitionKind.syntax):
        case (FracasDefinitionKind.variant):
        case (FracasDefinitionKind.key):
        case (FracasDefinitionKind.text):
        case (FracasDefinitionKind.enum):
        case (FracasDefinitionKind.mask):
            return 1;
        case (FracasDefinitionKind.variantOption):
        case (FracasDefinitionKind.gameData):
        case (FracasDefinitionKind.typeOptional):
        case (FracasDefinitionKind.type):
        case (FracasDefinitionKind.keyword):
        case (FracasDefinitionKind.unknown):
        default:
            return 2;
    }
}

function _memberDeclRx(
    fracasKind: FracasDefinitionKind,
    memberName: string,
    searchKind: SearchKind = SearchKind.wholeMatch
): RegExp {
    switch (fracasKind) {
        case (FracasDefinitionKind.define):
            return new RegExp(memberName ?
                anyNamedParamSymbolDeclarationRx(memberName, searchKind) :
                anyNamedParamDeclarationRx(),
                "gd");
        case (FracasDefinitionKind.key):
        case (FracasDefinitionKind.text):
        case (FracasDefinitionKind.enum):
        case (FracasDefinitionKind.mask):
            return new RegExp(anyIdentifierRx(memberName, searchKind), "gd");
        case (FracasDefinitionKind.syntax):
        case (FracasDefinitionKind.variant):
        case (FracasDefinitionKind.variantOption):
        case (FracasDefinitionKind.gameData):
        case (FracasDefinitionKind.typeOptional):
        case (FracasDefinitionKind.type):
        case (FracasDefinitionKind.keyword):
        case (FracasDefinitionKind.unknown):
        default:
            return new RegExp(memberName ?
                anyFieldSymbolDeclarationRx(memberName, searchKind) :
                anyFieldDeclarationRx(),
                "gd");
    }
}

export async function findComment(uri: vscode.Uri, position: vscode.Position): Promise<string> {
    const document = await vscode.workspace.openTextDocument(uri);

    // find comment at the end of the current line
    const line = document.lineAt(position.line);
    let match = line.text.match(RX_COMMENT);
    let comment = '';
    if (match) {
        comment = match[1];
    }

    // search backward for full-line comments, prepending to the existing comment.
    const lineCommentRx = new RegExp(`^\\s*${RX_COMMENT}`);
    for (let lineNo = position.line - 1; lineNo >= 0; --lineNo) {
        const lineText = document.lineAt(lineNo).text;
        match = lineCommentRx.exec(lineText);
        if (match) {
            comment = match[1] + '\n' + comment;
        } else if (/\S/.test(lineText)) {
            break; // found non-comment, non-whitespace, so stop searching
        }
    }

    return comment;
}

export function isOpenBracket(char: string): boolean {
    return char === '(' || char === '{' || char === '[';
}

export function isCloseBracket(char: string): boolean {
    return char === ')' || char === '}' || char === ']';
}

export function findOpenBracket(
    document: vscode.TextDocument,
    pos: vscode.Position | vscode.Range,
    includeBrackets = true
): vscode.Position | undefined {
    // compute initial nesting based on how many expression borders overlap the range.
    // e.g. if the selection within ( (hi)(ho) ) covers [i)(h] then the initial nesting at 'i' is -1
    let range = resolveRange(pos);
    // const firstChar = document.getText(new vscode.Range(range.start, range.start.translate(0, 1)));
    // const lastChar = document.getText(new vscode.Range(range.end, range.end.translate(0, -1)));
    let nesting = 0;
    let minNesting = 0; // isCloseBracket(lastChar) && !isOpenBracket(firstChar) ? -1 : 0; // nudge nesting inside the expression

    if (!range.isEmpty) {
        for (let lineNo = range.start.line; lineNo <= range.end.line; ++lineNo) {
            const line = document.lineAt(lineNo);
            for (
                // First time through outer loop, initialize charNo to start of `range`. Thereafter use 0, the start of the line.
                let charNo = (lineNo === range.start.line ? range.start.character : 0);
                charNo < (lineNo === range.end.line ? range.end.character : line.range.end.character);
                ++charNo
            ) {
                const c = line.text[charNo];
                if (c === ';') {
                    break; // skip comment
                } else if (isOpenBracket(c)) {
                    nesting += 1;
                } else if (isCloseBracket(c)) {
                    nesting -= 1;
                    if (nesting < minNesting) {
                        minNesting = nesting;
                    }
                }
            }
        }
    }

    // if the first character is the closing bracket, nudge backward one character inside the expression.
    // Otherwise opening bracket search fails because of an off-by-one error in the nesting calculation.
    if (isCloseBracket(document.getText(range.with({ end: range.start.translate(0, 1) })))) {
        range = range.with({ start: document.positionAt(document.offsetAt(range.start) - 1) });
    }

    // rewind to opening bracket
    for (let lineNo = range.start.line; lineNo >= 0; --lineNo) {
        const line = document.lineAt(lineNo);

        // pre-strip comments as we'll be scanning the string from end to start
        const nonCommentMatch = /([^;])*/.exec(line.text);
        const textBeforeComment = nonCommentMatch ? nonCommentMatch[0] : line.text;

        // scan backward from the start of the selection range to find the opening bracket
        for (
            // First time through outer loop, initialize charNo to selection `range` start. Thereafter use the end of the line.
            let charNo = (lineNo === range.start.line ? range.start.character : line.range.end.character);
            charNo >= line.range.start.character;
            --charNo
        ) {
            const c = textBeforeComment[charNo];
            if (isOpenBracket(c)) {
                nesting -= 1; // decrement nesting when moving backward outside a bracket pair
                // if we've found an opening bracket nested outside the range start, then we're done
                if (nesting < minNesting) {
                    const openParen = new vscode.Position(lineNo, charNo);
                    if (includeBrackets) {
                        return openParen;
                    } else {
                        return document.positionAt(document.offsetAt(openParen) + 1);
                    }
                }
            } else if (isCloseBracket(c)) {
                nesting += 1;
            }
        }
    }
    return undefined;
}

export function findEnclosingExpression(
    document: vscode.TextDocument,
    pos: vscode.Position | vscode.Range,
    includeBrackets = true
): vscode.Range | undefined {
    // first rewind to opening bracket
    const openParen = findOpenBracket(document, pos, includeBrackets);
    if (!openParen) {
        return undefined;
    }

    let nesting = includeBrackets ? 0 : 1; // if we're not including the brackets, we're already one nesting deep

    // scan forward from opening bracket to closing bracket
    for (let lineNo = openParen.line; lineNo < document.lineCount; ++lineNo) {
        const line = document.lineAt(lineNo);
        for (let charNo = (lineNo === openParen.line ? openParen.character : line.range.start.character); charNo <= line.range.end.character; ++charNo) {
            const c = line.text[charNo];
            if (c === ';') {
                break; // skip comment
            } else if (isOpenBracket(c)) {
                nesting += 1;
            } else if (isCloseBracket(c)) {
                nesting -= 1;
                if (nesting <= 0) {
                    let closeParen = new vscode.Position(lineNo, charNo + 1);
                    if (!includeBrackets) {
                        closeParen = document.positionAt(document.offsetAt(closeParen) - 1);
                    }
                    return new vscode.Range(openParen, closeParen);
                }
            }
        }
    }
    return new vscode.Range(openParen, new vscode.Position(document.lineCount - 1, document.lineAt(document.lineCount - 1).range.end.character));
}


function _rangesAtScope(
    document: vscode.TextDocument,
    pos: vscode.Position,
    scopeNestingDepth: number
): vscode.Range[] {
    const ranges: vscode.Range[] = [];
    // first rewind to opening bracket
    const startPos = findOpenBracket(document, pos, false) ?? new vscode.Position(0,0);
    let topExprPos = startPos;
    let nesting = 1; // if we're not including the brackets, we're already one nesting deep

    // scan forward looking for s-expressions with an opening bracket at the right nesting depth.
    for (let lineNo = startPos.line; lineNo < document.lineCount; ++lineNo) {
        const line = document.lineAt(lineNo);
        for (let charNo = (lineNo === startPos.line ? startPos.character : line.range.start.character); charNo < line.range.end.character; ++charNo) {
            const c = line.text[charNo];
            if (c === ';') {
                break; // skip comment
            } else if (isOpenBracket(c)) {
                if (nesting === scopeNestingDepth) { // only include lines that appear at top-level scope.
                    topExprPos = new vscode.Position(lineNo, charNo);
                }
                nesting += 1;
            } else if (isCloseBracket(c)) {
                nesting -= 1;
                if (nesting === scopeNestingDepth) { // only include lines that appear at top-level scope.
                    ranges.push(new vscode.Range(topExprPos, new vscode.Position(lineNo, charNo)));
                } else if (nesting <= 0) {
                    return ranges;
                }
            }
        }
    }
    return ranges;
}

export async function findEnclosingDefine(uri: vscode.Uri, pos: vscode.Position
): Promise<FracasDefinition | undefined> {
    const searchRx = new RegExp(anyDefineRx(), "g");
    const result = await searchBackward(uri, pos, searchRx);
    if (result) {
        const {line, match} = result;
        const [_, defToken, symbol] = match;
        const defineLoc = await regexGroupUriLocation(match, 2 /* rx group for the symbol */, uri, line.range.start);
        return new FracasDefinition(defineLoc, symbol, definitionKind(defToken));
    }
    return undefined;
}

export async function findEnclosingConstructor(document: vscode.TextDocument, pos: vscode.Position
): Promise<{location: vscode.Location, typeName: string} | undefined> {
    const openParen = findOpenBracket(document, pos);
    if (!openParen) {
        return undefined;
    }

    const searchRx = new RegExp(anyConstructorRx());
    const result = searchRx.exec(document.getText(new vscode.Range(openParen, pos)));
    if (result) {
        const [_, typeName] = result;
        const location = new vscode.Location(document.uri, openParen.translate({ characterDelta: result.index }));
        return {location, typeName};
    }
    return undefined;
}

export async function findEnclosingEnumOrMask(document: vscode.TextDocument, pos: vscode.Position
): Promise<FracasDefinition | undefined> {
    const openParen = findOpenBracket(document, pos);
    if (!openParen) {
        return undefined;
    }

    const searchRx = new RegExp(anyMaskOrEnumRx());
    const match = searchRx.exec(document.getText(new vscode.Range(openParen, pos)));
    if (match) {
        const [_, typeDecl, typeName] = match;
        const fracasKind = typeDecl === "enum" ? FracasDefinitionKind.enum : FracasDefinitionKind.mask;
        const location = regexGroupDocumentLocation(match, 2 /* rx group for the enum name */, document, openParen);
        return new FracasDefinition(location, typeName, fracasKind);
    }
    return undefined;
}

export async function isWithinVariant(
    uri: vscode.Uri, pos: vscode.Position, variantName: string
): Promise<boolean> {
    const fracasDef = await findEnclosingDefine(uri, pos);
    return fracasDef !== undefined
        && fracasDef.kind === FracasDefinitionKind.variant
        && fracasDef.symbol === variantName;
}

export function isWithinImport(document: vscode.TextDocument, pos: vscode.Position
): boolean {
    const openParen = findOpenBracket(document, pos);
    if (!openParen) {
        return false;
    }

    const searchRx = new RegExp(importKeywordRx());
    const result = searchRx.exec(document.getText(new vscode.Range(openParen, pos)));
    return !!result;
}

export async function findSymbolDefinition(
    typeName: string,
    token?: vscode.CancellationToken,
    searchKind = SearchKind.wholeMatch
): Promise<FracasDefinition[]> {
    typeName = typeName.replace(/(^-)|(-$)/g, ''); // trim leading/trailing hyphen
    const defineRxStr = anyDefineSymbolRx(typeName, searchKind);
    return _findDefinition(defineRxStr, token);
}

export async function findEnumDefinition(
    typeName: string,
    token?: vscode.CancellationToken,
    searchKind = SearchKind.wholeMatch
): Promise<FracasDefinition[]> {
    const defineRxStr = anyEnumSymbolRx(typeName, searchKind);
    return _findDefinition(defineRxStr, token);
}

export async function findMaskDefinition(
    typeName: string,
    token?: vscode.CancellationToken,
    searchKind = SearchKind.wholeMatch
): Promise<FracasDefinition[]> {
    const defineRxStr = anyMaskSymbolRx(typeName, searchKind);
    return _findDefinition(defineRxStr, token);
}

async function _findDefinition(
    defineRxStr: string,
    token?: vscode.CancellationToken
): Promise<FracasDefinition[]> {
    // search for an explicit define-xxx matching the token, e.g., given "module-db" find "(define-type module-db"
    const textMatches = await findTextInFiles(defineRxStr, token);
    fracasOut.appendLine(`Found ${textMatches.length} matches for ${defineRxStr}`);
    const defs = await mapAsync(textMatches, async textMatch => {
        // extract the symbol name substring, e.g. get "range-int" from "(define-type range-int"
        const rxMatch = new RegExp(defineRxStr).exec(textMatch.preview.text);
        if (rxMatch) {
            const [_, defToken, symbol] = rxMatch;
            const location = await regexGroupUriLocation(rxMatch, 2, textMatch.uri, getRange(textMatch.ranges).start);
            return new FracasDefinition(location, symbol, definitionKind(defToken));
        } else {
            vscode.window.showErrorMessage(`Failed to extract symbol name from ${textMatch.preview.text} using regex '${defineRxStr}'. An engineer should check that the regex is correct.`);
            const location = new vscode.Location(textMatch.uri, getRange(textMatch.ranges));
            return new FracasDefinition(location, textMatch.preview.text, definitionKind("define"));
        }
    });
    return defs;
}

export async function findVariantOptionDefinition(
    qualifiedVariant: string,
    token?: vscode.CancellationToken,
    searchKind = SearchKind.wholeMatch
): Promise<FracasDefinition[]> {
    // given a fully qualified "action-movement-modifier-add" find "(movement-modifier-add ... )"
    const variantOptionRxStr = variantOptionRx(qualifiedVariant, searchKind);
    const variantRx = new RegExp(variantOptionRxStr);
    const textMatches = await findTextInFiles(variantOptionRxStr, token);

    // discard results that are not within a define-variant that matches the remainder of the symbol.
    // i.e. check that a "(saved-actor ...)" variant option found when searching for "targeting-saved-actor"
    // is enclosed within  (define-variant targeting ...)
    const variantDefs = await mapAsync(textMatches, async result => {
        let bMatchingVariant = false;
        // extract the variant option name from the match, e.g. "action-movement-modifier-add" -> "movement-modifier-add"
        const variantRxMatch = variantRx.exec(result.preview.text);
        if (variantRxMatch) {
            // extract the variant name from the option, e.g. "action-movement-modifier-add" -> "action"
            const [variantOptionName, variantPartialMatch] = variantRxMatch;
            const variantName = qualifiedVariant.substring(0, qualifiedVariant.length - (variantPartialMatch.length + 1));
            const startPos = getRange(result.ranges).start;
            bMatchingVariant = await isWithinVariant(result.uri, startPos, variantName);
            if (bMatchingVariant) {
                const location = new vscode.Location(result.uri, getRange(result.ranges));
                return new FracasDefinition(location, `${variantName}-${variantOptionName}`, FracasDefinitionKind.variantOption);
            }
            // console.log(`"${variantName}" ${bMatchingVariant ? "FOUND in" : "not found in "} ${result.uri.path.substring(result.uri.path.lastIndexOf('/')+1)}:${startPos.line}: ${result.preview.text}`);
        }
        return undefined;
    });
    // console.log(results);

    return variantDefs.filter(x => x !== undefined) as FracasDefinition[];
}

/**
 * Find every file imported by a document. The "definition" of an import points to the
 * uri and position at the beginning of the imported file.
 * @param document the document to search
 * @returns a list of FracasDefinition for each file imported by this document
 */
export function findAllImportDefinitions(
    document: vscode.TextDocument
): FracasDefinition[] {
    const importExprRx = new RegExp(importExpressionRx(), "gd");

    // find all (import ...) expressions in the document
    const importExpressions = matchAll(importExprRx, document, 1);

    // extract the import definitions from each expression,
    // e.g. get defs for "unreal" and "abilities" from "(import unreal abilities)"
    const allImportDefs = importExpressions
        .filter(expr => isWithinImport(document, expr.range.start)) // drop matches outside an (import ...) expression
        .map(expr => {
            // extract the import symbols from the expression, e.g. get "unreal" from "(import unreal abilities)"
            // eslint-disable-next-line no-empty-character-class
            const imports = matchAll(/([a-zA-Z-/]+)/gd, document, 0, expr.range);
            const importDefs = imports
                .filter(imp => !_isCommentedOut(document, imp.range.start)) // drop comments
                .map(imp => _importToDefinition(document.getText(imp.range))); // convert to FracasDefinition
            return importDefs;
        });

    return flatten(allImportDefs);
}

/**
 * Find identifiers defined in a document and provided via a "(provide ...)" expression.
 * Note that transitively provided identifiers are excluded. For example, imagine a
 * module `stereo` and `car`: 
 * ;; stero.frc
 * (provide volume)
 * (define volume ...)
 * ;; car.frc
 * (import stero) 
 * (provide (all-defined-out)):
 * 
 * `car` transitively provides `volume` via `stereo`, but this method will exclude 
 * `volume` from results because it is not locally defined in `car`.
 * @param document the document to search
 * @returns a list of FracasDefinition for each file imported by this document
 */
 export async function findProvidedLocalIdentifiers(
    document: vscode.TextDocument,
    token?: vscode.CancellationToken
): Promise<Map<string, boolean>> {
    const symbols = await findDocumentSymbols(document.uri, token); // all identifiers defined in the document
    const providedIds = new Map(symbols.map(sym => [sym.name, false])); // initially map all identifiers to false (not provided)

    // find (provide ...) expression in the document
    const provideRx = new RegExp(provideKeywordRx());
    const provideMatch = provideRx.exec(document.getText());
    if (!provideMatch) {
        return providedIds;
    }

    // extract text of the (provide ...) expression
    const provideExprRange = findEnclosingExpression(document, document.positionAt(provideMatch.index), false);
    if (!provideExprRange) {
        return providedIds;
    }

    // get the body of the (provide ...) expression, omitting the `provide` keyword
    const provideBodyRange = provideExprRange.with(provideExprRange.start.translate(0, provideMatch[0].length));

    // extract the provide expressions from the body of the (provide ...)
    const providedExprRx = new RegExp(RX_PROVIDED_EXPRESSION, "gd");
    const provideMatches = matchAll(providedExprRx, document, 0, provideBodyRange);
    const provides = provideMatches.filter(provide => !_isCommentedOut(document, provide.range.start)); // drop comments

    // extract the provided identifiers from each provide expression, e.g. get "some-identifier" from "(provide some-identifier)"
    const exceptOutRx = new RegExp(RX_EXCEPT_OUT);
    const allDefinedOutRx = new RegExp(RX_ALL_DEFINED_OUT);
    const identifierRx = new RegExp(RX_IDENTIFIER, "gd");
    for (const provideLoc of provides) {
        const provide = document.getText(provideLoc.range)
        const exceptOutMatch = exceptOutRx.exec(provide);
        // NOTE: except-out check must come first or "allDefinedOutRx" will match the "all-defined-out" in the "except-out" body.
        if (exceptOutMatch) {
            // handle special case of except-out: it provides all except a list of identifiers
            // (provide
            //  (except-out (all-defined-out)
            //              ;; forward declared types
            //              action-block
            //              damage-data
            //              projectile-data
            //              ))
            // find the document offset of the except-out body in (except-out (all-defined-out) <except-out body>)
            const exceptOutBodyOffset = document.offsetAt(provideLoc.range.start) + exceptOutMatch.index + exceptOutMatch.length;
            const exceptOutBodyRange = provideLoc.range.with(provideLoc.range.start.translate(0, exceptOutBodyOffset));
            const exceptedIds = matchAll(identifierRx, document, 0, exceptOutBodyRange)
                .filter(except => !_isCommentedOut(document, except.range.start)) // drop comments
                .map(except => document.getText(except.range));

            // mark all identifiers as provided but the exceptions
            for (const id of providedIds.keys()) {
                providedIds.set(id, !exceptedIds.includes(id));
            }
        } else if (allDefinedOutRx.test(provide)) {
            // all-defined-out is a special case: it provides all identifiers defined in the document
            for (const id of providedIds.keys()) {
                providedIds.set(id, true);
            }
        } else {
            // A bare identifier is provided
            providedIds.set(provide, true);
        } 
    }

    return providedIds;
}


export function findAllIdentifiers(document: vscode.TextDocument): vscode.Location[] {
    const identifierRx = new RegExp(RX_IDENTIFIER, "gd");
    const identifiers = matchAll(identifierRx, document, 1);
    return identifiers;
}

/**
 * Find a file imported by the symbol at the given position. The "definition"
 * of an import points to the  uri and position at the beginning of the imported file.
 * @param document the document to search
 * @param position a position within the import symbol
 * @param importSymbol the text of the import symbol, like "fracas/utils/utils"
 * @returns FracasDefinition for the imported file
 */
async function _findImportDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    importSymbol: string
): Promise<FracasDefinition | undefined> {
    if (!isWithinImport(document, position)) {
        return undefined;
    }

    return _importToDefinition(importSymbol);
}

/**
 * convert an import symbol to a "definition" that points to the uri and position at the
 * beginning of the imported file.
 * @param importSymbol the text of the import symbol, like "fracas/utils/utils"
 * @returns a FracasDefinition pointing to the imported file
 */
function _importToDefinition(importSymbol: string): FracasDefinition {
    const importPath = importSymbol.startsWith("fracas/") ? importSymbol : "fracas/" + importSymbol;
    const importedUri = vscode.Uri.joinPath(getProjectFolder().uri, importPath + ".frc");
    const importDef = new FracasDefinition(
        new vscode.Location(importedUri, new vscode.Position(0, 0)),
        importSymbol, FracasDefinitionKind.import);

    return importDef;
}

/**
 * Check if a line is commented out a given position.
 * @param document the document containing the text
 * @param position the position of the text
 * @returns true if the line is commented out at the position
 */
function _isCommentedOut(document: vscode.TextDocument, position: vscode.Position): boolean {
    const prefix = document.getText(new vscode.Range(position.with({ character: 0 }), position));
    return prefix.includes(";");
}

export async function findKeywordDefinition(
    referencingDocument?: vscode.TextDocument,
    documentSelection?: vscode.Range,
    token?: vscode.CancellationToken,
    searchKind: SearchKind = SearchKind.wholeMatch
): Promise<FracasDefinition[]> {
    const { document, selection } = resolveSelection(referencingDocument, documentSelection);
    if (!document || !selection) {
        return [];
    }

    const keyword = getSelectedSymbol(document, selection);
    if (!keyword.startsWith(KEYWORD_PREFIX)) {
        return [];
    }

    // find the constructor in which this field is declared
    const constructorMatch = await findEnclosingConstructor(document, selection.start);
    if (!constructorMatch) {
        return [];
    }

    // find the type definition matching the constructor
    const {typeName} = constructorMatch;
    let symbolDefs = await findSymbolDefinition(typeName, token);
    if (symbolDefs.length === 0) {
        symbolDefs = await findVariantOptionDefinition(typeName, token);
    }

    // find the field declarations in the type definition
    const fieldDecls = await mapAsync(symbolDefs, async typeDef => {
        return await findMembers(typeDef, token, keyword.substring(KEYWORD_PREFIX.length), searchKind);
    });
    return flatten(fieldDecls);
}

export async function findEnumOrMaskMembers(
    referencingDocument?: vscode.TextDocument,
    documentPosition?: vscode.Position,
    enumMemberOrTypeName?: string,
    token?: vscode.CancellationToken,
    searchKind: SearchKind = SearchKind.wholeMatch
): Promise<FracasDefinition[]> {
    const { document, position } = resolvePosition(referencingDocument, documentPosition);
    if (!document || !position) {
        return [];
    }

    // if the symbol is the beginning of (mask foo thing... or (enum bar thing...
    // then try to auto-complete from the enum/mask definition
    const enclosingEnum = await findEnclosingEnumOrMask(document, position);
    if (!enclosingEnum) {
        return [];
    }

    const results: FracasDefinition[] = [];
    // find the definition of the enum/mask
    const enumDefs = enclosingEnum.kind === FracasDefinitionKind.enum ?
        await findEnumDefinition(enclosingEnum.symbol, token, SearchKind.partialMatch) :
        await findMaskDefinition(enclosingEnum.symbol, token, SearchKind.partialMatch);
    await mapAsync(enumDefs, async enumDef => {
        // add matching enum values to the list
        const enumMembers = await findMembers(enumDef, token, enumMemberOrTypeName, searchKind);

        // add the define-enum type definition to the results if it matches.
        if (enumMemberOrTypeName && _symbolsMatch(enumMemberOrTypeName, enumDef.symbol, searchKind)) {
            results.push(enumDef);
        }
        results.push(...enumMembers);
    });

    return results;
}

function _symbolsMatch(partialSymbol: string | undefined, symbolToMatch: string, searchKind: SearchKind): boolean {
    if (searchKind === SearchKind.wholeMatch) {
        return partialSymbol === symbolToMatch;
    } else {
        // "undefined" matches anything, otherwise match on the beginning of the symbol
        return !partialSymbol || symbolToMatch.startsWith(partialSymbol);
    }
}

export async function findDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token?: vscode.CancellationToken,
    searchKind: SearchKind = SearchKind.wholeMatch
): Promise<FracasDefinition[]> {
    const keywords: FracasDefinition[] = await findKeywordDefinition(
        document, new vscode.Range(position, position), token, searchKind);
    if (keywords.length > 0) {
        return keywords;
    }

    // git the symbol at the cursor
    const symbol = getSelectedSymbol(document, position, true);

    // if the cursor is within an (import ... ) statement, find the source document
    const importDef = await _findImportDefinition(document, position, symbol);
    if (importDef) {
        return [importDef];
    }

    // if the cursor is within a (mask ...) or (enum ...) declaration, search for matching enum members
    const enumMembers = await findEnumOrMaskMembers(document, position, symbol, token, searchKind);
    if (enumMembers.length > 0) {
        return enumMembers;
    }

    // search for an explicit define-xxx matching the token, e.g., given "module-db" find "(define-type module-db"
    const symbolDefs = await findSymbolDefinition(symbol, token, searchKind);
    if (symbolDefs.length > 0) {
        return symbolDefs;
    }

    // search for a variant option matching the symbol
    // given a fully qualified "action-movement-modifier-add" find "(movement-modifier-add ... )"
    const variantOptionDefs = await findVariantOptionDefinition(symbol, token, searchKind);

    return variantOptionDefs;
}

export async function findReferences(
    referencingDocument?: vscode.TextDocument,
    documentPosition?: vscode.Position,
    token?: vscode.CancellationToken
): Promise<vscode.Location[]> {
    const { document, position } = resolvePosition(referencingDocument, documentPosition);
    if (!document || !position) {
        return [];
    }

    const symbol = getSelectedSymbol(document, position);
    // Do a dumb search for all text matching the symbol
    const symbolRx = anySymbolRx(symbol);
    const results = await findTextInFiles(symbolRx, token);

    // if the symbol is part of a variant, search for the full variant option name. E.g. if the cursor is
    // on (combat-focus ()) within (define-variant targeting-gather ...), search for "targeting-gather-combat-focus"
    const fracasDef = await findEnclosingDefine(document.uri, position);
    if (fracasDef?.kind === FracasDefinitionKind.variant) {
        const variantOption = `${fracasDef.symbol}-${symbol}`;
        const variantResults = await findTextInFiles(anySymbolRx(variantOption), token);
        results.push(...variantResults);
    }

    // convert results from TextSearchMatch to Location
    const links = results.map(result =>
        new vscode.Location(result.uri, getRange(result.ranges)));
    return links;
}

export async function findDocumentSymbols(
    uri: vscode.Uri, token?: vscode.CancellationToken
): Promise<vscode.SymbolInformation[]> {
    return _findSymbols(undefined, uri, token);
}

export async function findWorkspaceSymbols(
    symbol: string,
    token?: vscode.CancellationToken
): Promise<vscode.SymbolInformation[]> {
    return _findSymbols(symbol, undefined, token);
}

async function _findSymbols(
    symbol?: string, uri?: vscode.Uri, token?: vscode.CancellationToken
): Promise<vscode.SymbolInformation[]> {
    const defineRxStr = symbol ? definePartialSymbolRx(symbol) : anyDefineRx();
    const defineRx = new RegExp(defineRxStr);
    const textMatches = await findTextInFiles(defineRxStr, token, uri?.fsPath);
    const symbols = textMatches
        .filter(searchMatch => searchMatch?.preview?.text !== undefined)
        .map(searchMatch => {
            const rxMatch = defineRx.exec(searchMatch.preview.text);
            const [_, defToken, typeName] = rxMatch ?? [undefined, undefined, searchMatch.preview.text];
            const symbol = new vscode.SymbolInformation(
                typeName ?? 'unknown',
                symbolKind(definitionKind(defToken ?? 'define')),
                path.basename(searchMatch.uri.path),
                new vscode.Location(searchMatch.uri, getRange(searchMatch.ranges))
            );
            return symbol;
        });
    return symbols;
}

export async function findCompletions(
    document: vscode.TextDocument,
    position: vscode.Position,
    token?: vscode.CancellationToken
): Promise<vscode.CompletionItem[] | null> {
    const completions = await _findCompletionsNonUnique(document, position, token);
    return completions ? uniqBy(completions, c => c.label) : null; // .sort((a, b) => Number(a > b)) : null;
}
async function _findCompletionsNonUnique(
    document: vscode.TextDocument,
    position: vscode.Position,
    token?: vscode.CancellationToken
): Promise<vscode.CompletionItem[] | null> {
        // get the word at the cursor
    const resolvedSymbol = resolveSymbol(document, position);
    if (!resolvedSymbol) {
        return null;
    }

    // truncate the partial word at the cursor position
    const symbolRange = new vscode.Range(resolvedSymbol.range.start, position);
    const symbol = resolvedSymbol.document.getText(symbolRange);

    // if the symbol is the beginning of (mask foo thing... or (enum bar thing...
    // then try to auto-complete from the enum/mask definition
    const enumMatches = await findEnumOrMaskMembers(document, position, symbol, token, SearchKind.partialMatch);
    if (enumMatches.length > 0) {
        const enumCompletions = await _toCompletionItems(enumMatches, '', resolvedSymbol.range);
        return enumCompletions;
    }

    // try to auto-complete a member field name
    if (symbol.startsWith(KEYWORD_PREFIX)) {
        // do a partial match of all field definitions matching the symbol under the cursor
        const keywordDefs = await findKeywordDefinition(
            resolvedSymbol.document, symbolRange, token, SearchKind.partialMatch);
        if (keywordDefs.length === 0) {
            return null;
        }

        const keywordCompletions = await _toCompletionItems(
            keywordDefs, KEYWORD_PREFIX, resolvedSymbol.range);
        fracasOut.appendLine(`Found ${keywordCompletions.length} keywords for ${symbol}`);
        return keywordCompletions;
    }

    // don't try to complete type definitions until at least three characters are typed
    if (position.character - resolvedSymbol.range.start.character < 3) {
        return null;
    }

    const completionItems: vscode.CompletionItem[] = [];
    // search for an explicit define-xxx matching the token, e.g., given "module-db" find "(define-type module-db"
    const typeDefs = await findSymbolDefinition(symbol, token, SearchKind.partialMatch);
    if (typeDefs.length === 0) {
        return null;
    }

    // add the type definitions as completion items, e.g. "targeting-ga" => "targeting-gather"
    const typeCompletions = await _toCompletionItems(typeDefs, '', resolvedSymbol.range);

    // also suggest variant options as completions for matching variant types.
    // e.g., targeting-gat => targeting-gather-self, targeting-gather-saved-actor, etc.
    const variantDefs = typeDefs.filter(x => x.kind === FracasDefinitionKind.variant);
    const variantOptionCompletions = flatten(await mapAsync(variantDefs, async variantDef => {
        const options = await findMembers(variantDef, token);
        const optionCompletions = await _toCompletionItems(options, `${variantDef.symbol}-`, resolvedSymbol.range);
        return optionCompletions;
    }));

    fracasOut.appendLine(`Found ${typeDefs.length} types and ${variantOptionCompletions.length} variant options for ${symbol}`);
    completionItems.push(...typeCompletions);
    completionItems.push(...variantOptionCompletions);

    // find variant options matching the symbol, e.g. targeting-gather-sa => targeting-gather-saved-actor
    const variantOptions = await findVariantOptionDefinition(symbol, token, SearchKind.partialMatch);
    const variantCompletions = await _toCompletionItems(variantOptions, '', resolvedSymbol.range);
    fracasOut.appendLine(`Found ${variantOptionCompletions.length} variant options for ${symbol}`);

    completionItems.push(...variantCompletions);
    return completionItems;
}

async function _toCompletionItems(
    definitions: FracasDefinition[], prefix: string, replaceRange: vscode.Range
): Promise<vscode.CompletionItem[]> {
    const completionItems: vscode.CompletionItem[] = await mapAsync(definitions, async definition => {
        const item = new vscode.CompletionItem(`${prefix}${definition.symbol}`, definition.completionKind);
        item.documentation = await findComment(definition.location.uri, definition.location.range.start);
        item.range = replaceRange;
        return item;
    });
    return completionItems;
}

export async function findMembers(
    fracasDef: FracasDefinition,
    token?: vscode.CancellationToken,
    memberName?: string,
    searchKind: SearchKind = SearchKind.wholeMatch
): Promise<FracasDefinition[]> {
    const document = await vscode.workspace.openTextDocument(fracasDef.location.uri);

    // find the text ranges of all member declarations
    const scopeNestingDepth = _memberScopeDepth(fracasDef.kind);
    const ranges = await _rangesAtScope(document, fracasDef.location.range.start, scopeNestingDepth);

    // Only the first s-expression in a function definition contains members, e.g.
    // (define (some-function #:first-param (...) #:second-param (...)) (|# function-body #|))
    // the rest of the s-expressions are just the function body.
    if (fracasDef.kind === FracasDefinitionKind.define) {
        ranges.splice(1); // drop all but the first s-expression
    }

    // find members that match the given name
    if (fracasDef.kind === FracasDefinitionKind.enum || fracasDef.kind === FracasDefinitionKind.mask)
    {
        // short-circuit for enum and mask members: this is a hacky workaround because mask
        // members may be naked identifiers, or may be s-expressions that contain a single identifier with
        // metadata. It's impossible to write a single regexp that handles both.
        const enumMembers = ranges.map(range =>
            _findEnumMembers(document, range, definitionMemberKind(fracasDef.kind), searchKind, memberName));
        return flatten(enumMembers);
    } else { // for types other than enums and masks, use the regexp to find members
        const fieldRx = _memberDeclRx(fracasDef.kind, memberName ?? '', searchKind);
        const members = ranges.map(range => {
            // search at this scope for members
            const matches = matchAll(fieldRx, document, 1, range);
            return matches.map(match =>
                new FracasDefinition(match, document.getText(match.range), definitionMemberKind(fracasDef.kind)));
        });
        return flatten(members);
    }
}

const ENUM_MEMBER_RX = new RegExp(enumMemberRx());

function _findEnumMembers(
    document: vscode.TextDocument,
    enumBodyRange: vscode.Range,
    enumMemberKind: FracasDefinitionKind,
    searchKind: SearchKind,
    nameToSearchFor?: string
): FracasDefinition[] {
    const enumBody = document.getText(enumBodyRange);
    const newlineRx = /\r?\n/g;
    const enumMembers = [];
    let lineMatch;
    let lineStartPos = 0;
    do {
        // extract the next line
        lineMatch = newlineRx.exec(enumBody);
        const lineEndPos = lineMatch ? (lineMatch.index + lineMatch[0].length) : enumBody.length;
        const line = enumBody.substring(lineStartPos, lineEndPos);

        // extract first identifier from the line. Discard leading space and parentheses
        const enumMemberMatch = ENUM_MEMBER_RX.exec(line);

        // if the enum member matches the given memberName, add it to the list of members
        if (enumMemberMatch && _symbolsMatch(nameToSearchFor, enumMemberMatch[1], searchKind)) {
            const enumMemberName = enumMemberMatch[1];
            const enumMemberPos = document.positionAt(document.offsetAt(enumBodyRange.start) + lineStartPos + line.indexOf(enumMemberName));
            const loc = new vscode.Location(document.uri, new vscode.Range(enumMemberPos, enumMemberPos.translate(0, enumMemberName.length)));
            enumMembers.push(new FracasDefinition(loc, enumMemberName, enumMemberKind));
        }

        lineStartPos = lineEndPos;
    } while (lineMatch);

    return enumMembers;
}

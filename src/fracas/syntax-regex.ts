import { escapeForRegEx } from "../regular-expressions";

export enum SearchKind {
    wholeMatch,
    partialMatch
}

export const RX_ALL_DEFINED_OUT = '\(all-defined-out\)'
export const RX_CHAR_IDENTIFIER = '[\\w\\-\\*\\.]';
export const RX_CHARS_CLOSE_PAREN = '\\)|\\}|\\]';
export const RX_CHARS_OPEN_PAREN = '\\(|\\{|\\[';
export const RX_CHARS_SPACE = '\\s|\\r|\\n';
export const RX_COMMENT = ';;?\\s*(.*)\\s*$';
export const RX_EXCEPT_OUT = '\\(except-out\\s+\\(\\s*all-defined-out\\s*\\)';
export const RX_EXCEPT_OUT_EXPR = `${RX_EXCEPT_OUT}[\\s\\n]+([^\\)]+)\\)`;
export const RX_IDENTIFIER = `(${RX_CHAR_IDENTIFIER}+)`
export const RX_SYMBOLS_DEFINE = 'define-enum|define-game-data|define-key|define-text|define-string-table|define-mask|define-type-optional|define-syntax|define-syntax-rule|define-type|struct|define-variant|define|define-list';
/**
 * A regex that matches an expression within the body of a "(provide ...", one of the forms:
 * (provide (all-defined-out))
 * 
 * (provide 
 *  some-bare-identifier 
 *  another-bare-identifier)
 * 
 * (provide
 *  (except-out (all-defined-out)
 *              ;; forward declared types
 *              action-block
 *              damage-data
 *              projectile-data
 *              ))
 * 
 */
export const RX_PROVIDED_EXPRESSION = `(${RX_CHAR_IDENTIFIER}+|${RX_EXCEPT_OUT_EXPR}|${RX_ALL_DEFINED_OUT})`;

export function anySymbolRx(symbol: string): string {
    return `(?<!${RX_CHAR_IDENTIFIER})(${escapeForRegEx(symbol)})(?!${RX_CHAR_IDENTIFIER})`;
}

export function anyDefineRx(): string {
    return `(?<=[${RX_CHARS_OPEN_PAREN}])\\s*(${RX_SYMBOLS_DEFINE})\\s*[${RX_CHARS_OPEN_PAREN}]?\\s*(${RX_CHAR_IDENTIFIER}+)(?!${RX_CHARS_CLOSE_PAREN})`;
}

export function anyDefineSymbolRx(symbol: string, searchKind = SearchKind.wholeMatch): string {
    return searchKind === SearchKind.wholeMatch ?
        `(?<=[${RX_CHARS_OPEN_PAREN}])\\s*(${RX_SYMBOLS_DEFINE})\\s*[${RX_CHARS_OPEN_PAREN}]?\\s*(${escapeForRegEx(symbol)})(?!${RX_CHAR_IDENTIFIER}|${RX_CHARS_CLOSE_PAREN})` :
        `(?<=[${RX_CHARS_OPEN_PAREN}])\\s*(${RX_SYMBOLS_DEFINE})\\s*[${RX_CHARS_OPEN_PAREN}]?\\s*(${escapeForRegEx(symbol)}${RX_CHAR_IDENTIFIER}*)(?!${RX_CHARS_CLOSE_PAREN})`;
}

export function definePartialSymbolRx(symbol: string): string {
    return `(?<=[${RX_CHARS_OPEN_PAREN}])\\s*(${RX_SYMBOLS_DEFINE})\\s*[${RX_CHARS_OPEN_PAREN}]?\\s*(${RX_CHAR_IDENTIFIER}*${escapeForRegEx(symbol)}${RX_CHAR_IDENTIFIER}*)(?!${RX_CHARS_CLOSE_PAREN})`;
}

export function anyEnumSymbolRx(symbol: string, searchKind = SearchKind.wholeMatch): string {
    return searchKind === SearchKind.wholeMatch ?
        `(?<=[${RX_CHARS_OPEN_PAREN}])\\s*(define-enum)\\s+(${escapeForRegEx(symbol)})(?!${RX_CHAR_IDENTIFIER})` :
        `(?<=[${RX_CHARS_OPEN_PAREN}])\\s*(define-enum)\\s+(${escapeForRegEx(symbol)}${RX_CHAR_IDENTIFIER}*)`;
}

export function anyMaskSymbolRx(symbol: string, searchKind = SearchKind.wholeMatch): string {
    return searchKind === SearchKind.wholeMatch ?
        `(?<=[${RX_CHARS_OPEN_PAREN}])\\s*(define-mask)\\s+(${escapeForRegEx(symbol)})(?!${RX_CHAR_IDENTIFIER})` :
        `(?<=[${RX_CHARS_OPEN_PAREN}])\\s*(define-mask)\\s+(${escapeForRegEx(symbol)}${RX_CHAR_IDENTIFIER}*)`;
}

export function enumMemberRx(): string {
    // extract the first identifier in the line, discarding leading whitespace and open parentheses
    return `^\\s*[${RX_CHARS_OPEN_PAREN}]?\\s*(${RX_CHAR_IDENTIFIER}+)`;
}

export function anyConstructorRx(): string {
    return `(?<=[${RX_CHARS_OPEN_PAREN}])\\s*(${RX_CHAR_IDENTIFIER}+):`;
}

/**
 * @returns a regex that matches an import declaration such as "(import ..."
 */
export function importKeywordRx(): string {
    return `(?<=[${RX_CHARS_OPEN_PAREN}])\\s*import(?:\\+export)?`;
}

/**
 * @returns a regex that captures the body of an import expression such as "(import one two three)".
 */
export function importExpressionRx(): string {
    return `${importKeywordRx()}[\\s\\n]+([^${RX_CHARS_CLOSE_PAREN}]+)(?=[${RX_CHARS_CLOSE_PAREN}])`;
}

/**
 * @returns a regex that matches a provide declaration such as "(provide ..."
 */
 export function provideKeywordRx(): string {
    return `(?<=[${RX_CHARS_OPEN_PAREN}])\\s*provide\\b`;
}

export function anyFieldSymbolDeclarationRx(fieldName: string, searchKind = SearchKind.wholeMatch): string {
    return searchKind === SearchKind.wholeMatch ?
        `(?<=^\\s*[${RX_CHARS_OPEN_PAREN}])\\s*(${escapeForRegEx(fieldName)})(?!${RX_CHAR_IDENTIFIER})` :
        `(?<=^\\s*[${RX_CHARS_OPEN_PAREN}])\\s*(${escapeForRegEx(fieldName)}${RX_CHAR_IDENTIFIER}*)`;
}

export function anyFieldDeclarationRx(): string {
    return `(?<=^\\s*[${RX_CHARS_OPEN_PAREN}])\\s*(?!define)(${RX_CHAR_IDENTIFIER}+)`;
}

export function anyNamedParamSymbolDeclarationRx(paramName: string, searchKind = SearchKind.wholeMatch): string {
    return searchKind === SearchKind.wholeMatch ?
        `(?<=#:)(${escapeForRegEx(paramName)})(?!${RX_CHAR_IDENTIFIER})` :
        `(?<=#:)(${escapeForRegEx(paramName)}${RX_CHAR_IDENTIFIER}*)`;
}

export function anyNamedParamDeclarationRx(): string {
    return `(?<=#:)(${RX_CHAR_IDENTIFIER}+)`;
}

export function anyMaskOrEnumRx(): string {
    return `(?<=[${RX_CHARS_OPEN_PAREN}])\\s*(mask|enum)\\s+(${RX_CHAR_IDENTIFIER}+)`;
}

export function anyIdentifierRx(fieldName: string, searchKind = SearchKind.wholeMatch): string {
    if (searchKind === SearchKind.wholeMatch) {
        return `(?<!${RX_CHAR_IDENTIFIER})(${escapeForRegEx(fieldName)})(?!${RX_CHAR_IDENTIFIER})`;
    } else {
        // if the field name isn't empty, find anything starting with the name. Otherwise, find 1 or more identifier chars.
        const fieldExpr = fieldName ? `(${escapeForRegEx(fieldName)}${RX_CHAR_IDENTIFIER}*)` : RX_IDENTIFIER;
        // // This ensures that identifiers appear either at the very beginning of an s-expression, e.g. "(some-identifier...)"
        // // or are naked identifiers (not enclosed within an s-expression), e.g. "some-identifier another-identifier third-id"
        // return `(?:[${RX_CHARS_OPEN_PAREN}]\\s*|[^${RX_CHARS_OPEN_PAREN}]*)${fieldExpr}`;
        return fieldExpr;
    }
}

export function variantOptionRx(symbol: string, searchKind = SearchKind.wholeMatch): string {
    // a variant option has a prefix for the variant type followed by the option name.
    // e.g., (define-variant action (movement-modifier-add ... ) appears as "action-movement-modifier-add".
    // Make an rx that drops one or more prefixes, and then match the rest of the string.
    const crumbs = escapeForRegEx(symbol)
        .split('-') // "action-movement-modifier-add" -> ["action", "movement", "modifier", "add"]
        .filter(c => c.length > 0);		// remove dangling hyphens
    const optionRx = crumbs
        .slice(1, crumbs.length - 1) 		// -> ["movement", "modifier"]
        .map(s => `(${s}-)?`) 			// -> ["(movement-)?", "(modifier-)?"]
        .join('') + crumbs[crumbs.length - 1]; // -> "(movement-)?(modifier-)?add"

    return searchKind === SearchKind.wholeMatch ?
        `(?<=[${RX_CHARS_OPEN_PAREN}])\\s*(${optionRx})(?!${RX_CHAR_IDENTIFIER})` :
        `(?<=[${RX_CHARS_OPEN_PAREN}])\\s*(${optionRx})(${RX_CHAR_IDENTIFIER}*)`;
}

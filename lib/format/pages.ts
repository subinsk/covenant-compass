// Page numbers to show in a pager: first, last, and the current page with its
// neighbours. Callers draw an ellipsis wherever two neighbours aren't consecutive.
export function pageWindow(page: number, totalPages: number): number[] {
    return [...new Set([1, page - 1, page, page + 1, totalPages])]
        .filter(p => p >= 1 && p <= totalPages)
        .sort((a, b) => a - b)
}

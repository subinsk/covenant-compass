import { edgarJson, filingDocUrl, filingFolderUrl, getSubmissions } from './client'

export type Exhibit = {
    accessionNumber: string
    form: string
    filingDate: string
    filename: string
    url: string
}

export type FindExhibitsOptions = {
    formTypes?: string[]
    exhibitPrefix?: string
    limit?: number
}

type FilingIndex = {
    directory: { item: { name: string }[] }
}

// Heuristic: an exhibit file is an HTML/text document whose name contains the
// exhibit number with an optional "ex"/"exhibit" spelling and separator, e.g. for
// EX-10: "ex10-1.htm", "ex-10.htm", "d123dex101.htm", "exhibit1012.htm". Imperfect by design.
export function isExhibitName(name: string, exhibitPrefix = 'EX-10'): boolean {
    const num = exhibitPrefix.replace(/^EX-?/i, '')
    const pattern = new RegExp(`ex(hibit)?[-_.]?${num}`, 'i')
    return pattern.test(name) && /\.(htm|html|txt)$/i.test(name)
}

export async function findExhibits(cik: string | number, options: FindExhibitsOptions = {}): Promise<Exhibit[]> {
    const { formTypes = ['8-K', '10-K', '10-Q'], exhibitPrefix = 'EX-10', limit = 20 } = options
    const recent = (await getSubmissions(cik)).filings.recent

    const filings = recent.accessionNumber
        .map((accessionNumber, i) => ({ accessionNumber, form: recent.form[i], filingDate: recent.filingDate[i] }))
        .filter((f) => formTypes.includes(f.form))
        .slice(0, limit)

    const exhibits: Exhibit[] = []
    for (const filing of filings) {
        const index = await edgarJson<FilingIndex>(`${filingFolderUrl(cik, filing.accessionNumber)}/index.json`)
        for (const item of index.directory?.item ?? []) {
            if (!isExhibitName(item.name, exhibitPrefix)) continue
            exhibits.push({ ...filing, filename: item.name, url: filingDocUrl(cik, filing.accessionNumber, item.name) })
        }
    }
    return exhibits
}

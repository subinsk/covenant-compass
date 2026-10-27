import { describe, expect, it } from 'vitest'
import { pageWindow } from './pages'

describe('pageWindow', () => {
    it('shows first, last and the neighbours of the current page', () => {
        expect(pageWindow(5, 10)).toEqual([1, 4, 5, 6, 10])
    })

    it('stays within range at the edges', () => {
        expect(pageWindow(1, 1)).toEqual([1])
        expect(pageWindow(1, 3)).toEqual([1, 2, 3])
        expect(pageWindow(10, 10)).toEqual([1, 9, 10])
    })
})

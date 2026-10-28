'use client'

import { useEffect, useRef } from 'react'

// Open overlays, oldest first. Only the last one reacts to Escape, so closing a
// modal stacked on another leaves the one underneath open.
const openOverlays: symbol[] = []

// Shared behaviour for modals and side panels: Escape closes, the page behind
// can't scroll, and a click on the backdrop closes. Spread the returned props
// on the backdrop element.
export function useOverlay(onClose: () => void) {
    const onCloseRef = useRef(onClose)
    // Only close when the press also started on the backdrop, so selecting text
    // in a field and releasing outside the dialog doesn't close it.
    const pressedBackdrop = useRef(false)

    useEffect(() => {
        onCloseRef.current = onClose
    })

    useEffect(() => {
        const id = Symbol('overlay')
        openOverlays.push(id)
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && openOverlays.at(-1) === id) onCloseRef.current()
        }
        window.addEventListener('keydown', onKey)

        // Pad by the scrollbar width so the page doesn't shift when it disappears.
        // A stacked overlay saves the already-locked values and restores them.
        const root = document.documentElement
        const previous = { overflow: root.style.overflow, paddingRight: root.style.paddingRight }
        const scrollbar = window.innerWidth - root.clientWidth
        root.style.overflow = 'hidden'
        if (scrollbar > 0) root.style.paddingRight = `${scrollbar}px`

        return () => {
            openOverlays.splice(openOverlays.indexOf(id), 1)
            window.removeEventListener('keydown', onKey)
            root.style.overflow = previous.overflow
            root.style.paddingRight = previous.paddingRight
        }
    }, [])

    return {
        onPointerDown: (e: React.PointerEvent) => { pressedBackdrop.current = e.target === e.currentTarget },
        onClick: (e: React.MouseEvent) => {
            if (pressedBackdrop.current && e.target === e.currentTarget) onCloseRef.current()
            pressedBackdrop.current = false
        },
    }
}

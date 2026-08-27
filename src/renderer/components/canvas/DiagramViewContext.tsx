'use client';

import { createContext, useContext } from 'react';

export type DiagramViewMode = 'ux' | 'technical';

const DiagramViewContext = createContext<DiagramViewMode>('ux');

export const DiagramViewProvider = DiagramViewContext.Provider;
export const useDiagramView = () => useContext(DiagramViewContext);

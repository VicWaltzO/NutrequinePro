export function readTheme(): 'light' | 'dark';
export function subscribeTheme(listener: () => void): () => void;
export function changeTheme(next: 'light' | 'dark'): void;
export function readView(): string;
export function subscribeView(listener: () => void): () => void;

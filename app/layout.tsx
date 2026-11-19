import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Ink Position Guardian', description: 'A read-only risk workspace for Tydro borrowers.' };
export default function Layout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }

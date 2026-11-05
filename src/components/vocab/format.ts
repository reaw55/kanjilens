/** Human-friendly "next review" label, e.g. "due now", "in 3h", "in 2d". */
export function describeDue(iso: string, now: number): string {
    const diff = new Date(iso).getTime() - now;
    if (Number.isNaN(diff) || diff <= 0) return "due now";
    const minutes = Math.round(diff / 60_000);
    if (minutes < 60) return `in ${Math.max(1, minutes)}m`;
    const hours = Math.round(minutes / 60);
    if (hours < 48) return `in ${hours}h`;
    return `in ${Math.round(hours / 24)}d`;
}

export const SOURCE_LABELS: Record<string, string> = {
    scan: "Scan",
    manual: "Manual",
    starter: "Starter",
    related: "Related",
    import: "Imported",
};

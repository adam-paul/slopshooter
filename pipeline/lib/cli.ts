export function requireEnv(name: string): string {
	const v = process.env[name];
	if (!v) throw new Error(`Missing required env var ${name}`);
	return v;
}

export function arg(name: string): string | boolean | undefined {
	const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
	if (hit === undefined) return undefined;
	return hit.includes('=') ? hit.split('=').slice(1).join('=') : true;
}

/** Bare `--flag`, `--flag=true/1`, `--flag=false/0`. Anything else aborts the run. */
export function boolArg(name: string): boolean {
	const v = arg(name);
	if (v === undefined) return false;
	if (v === true || v === 'true' || v === '1') return true;
	if (v === 'false' || v === '0') return false;
	throw new Error(`Invalid value for --${name}: "${String(v)}" (expected true/false)`);
}

export function intArg(name: string, fallback: number): number {
	const v = arg(name);
	if (v === undefined) return fallback;
	const n = Number(v);
	if (!Number.isInteger(n) || n <= 0) {
		throw new Error(`Invalid value for --${name}: "${String(v)}" (expected a positive integer)`);
	}
	return n;
}

/** `--name=YYYY-MM-DD` parsed as a UTC date. */
export function dateArg(name: string, fallback: string): Date {
	const v = arg(name) ?? fallback;
	if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
		throw new Error(`Invalid value for --${name}: "${String(v)}" (expected YYYY-MM-DD)`);
	}
	const d = new Date(`${v}T00:00:00Z`);
	if (Number.isNaN(d.getTime())) throw new Error(`Invalid date for --${name}: "${v}"`);
	return d;
}

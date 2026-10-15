export type ProceedDetail = {
	scope: HTMLElement;
	waitUntil: (check: Promise<boolean>) => void;
};

/** Opt-in async checks; ordinary field validators remain synchronous. */
export default async function beforeProceed(form: HTMLElement, scope: HTMLElement): Promise<boolean> {
	const checks: Promise<boolean>[] = [];
	form.dispatchEvent(
		new CustomEvent<ProceedDetail>('modularity-frontend-form:beforeProceed', {
			detail: { scope, waitUntil: (check) => checks.push(check) },
		}),
	);
	try {
		return (await Promise.all(checks)).every(Boolean);
	} catch {
		return false;
	}
}

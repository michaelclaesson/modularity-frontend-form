import beforeProceed, { type ProceedDetail } from './beforeProceed';

describe('asynchronous preflight checks', () => {
	it('allows forms with no extension checks', async () => {
		const form = document.createElement('form');
		expect(await beforeProceed(form, form)).toBe(true);
	});

	it('waits for every check and blocks navigation when one fails', async () => {
		const form = document.createElement('form');
		const step = document.createElement('section');
		let finish!: (valid: boolean) => void;
		form.addEventListener('modularity-frontend-form:beforeProceed', (event) => {
			const detail = (event as CustomEvent<ProceedDetail>).detail;
			expect(detail.scope).toBe(step);
			detail.waitUntil(Promise.resolve(true));
			detail.waitUntil(
				new Promise((resolve) => {
					finish = resolve;
				}),
			);
		});
		let finished = false;
		const check = beforeProceed(form, step).then((valid) => {
			finished = true;
			return valid;
		});
		await Promise.resolve();
		expect(finished).toBe(false);
		finish(false);
		expect(await check).toBe(false);
	});

	it('blocks navigation if an extension rejects its check', async () => {
		const form = document.createElement('form');
		form.addEventListener('modularity-frontend-form:beforeProceed', (event) => {
			(event as CustomEvent<ProceedDetail>).detail.waitUntil(Promise.reject(new Error('Unavailable')));
		});
		expect(await beforeProceed(form, form)).toBe(false);
	});
});

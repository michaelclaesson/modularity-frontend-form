import LinkedLocation from './linkedLocation';
import beforeProceed from '../validation/beforeProceed';

describe('linked locations', () => {
	let form: HTMLFormElement;
	let name: HTMLInputElement;
	let select: HTMLSelectElement;
	let source: HTMLInputElement;
	let loadAddress: jest.Mock;
	let controller: LinkedLocation;
	const place = { id: 7, name: 'Hallen', place: { name: 'Hallen', address: 'Gatan 1', latitude: 55, longitude: 13 } };

	beforeEach(() => {
		jest.useFakeTimers();
		document.body.innerHTML =
			'<form><section id="source"><input type="radio" value="new" checked></section><section id="name"><input></section><section id="select"><select><option value=""></option><option value="7">Hallen – Gatan 1</option></select></section><section id="address"></section><section id="attendance"><input type="radio" value="offline" checked></section></form>';
		form = document.querySelector('form')!;
		name = document.querySelector('#name input')!;
		source = document.querySelector('#source input')!;
		select = document.querySelector('select')!;
		loadAddress = jest.fn();
		const conditions = { checkConditions: jest.fn() };
		const radio = (id: string) => ({
			getFieldContainer: () => document.getElementById(id)!,
			getSelectedChoice: () => (document.querySelector(`#${id} input`) as HTMLInputElement).value,
			getChoices: () => document.querySelectorAll(`#${id} input`),
			getConditionsHandler: () => conditions,
			getValueLoader: () => ({
				load: (value: string) => {
					source.value = value;
				},
			}),
		});
		const selector = {
			getField: () => select,
			getFieldContainer: () => document.getElementById('select')!,
			getValueLoader: () => ({
				load: (value: number) => {
					select.value = String(value);
					select.dispatchEvent(new Event('change'));
				},
			}),
		};
		const fields = {
			source: radio('source'),
			attendance: radio('attendance'),
			name: { getFieldContainer: () => document.getElementById('name')!, getField: () => name },
			address: {
				getFieldContainer: () => document.getElementById('address')!,
				getValueLoader: () => ({ load: loadAddress }),
			},
		};
		controller = new LinkedLocation(form, selector as unknown as SelectInterface, fields as unknown as FieldsObject, {
			sourceField: 'source',
			attendanceField: 'attendance',
			nameField: 'name',
			addressField: 'address',
			termsUrl: 'https://example.test/places',
			matchesUrl: 'https://example.test/matches',
			strings: {
				duplicate: 'Duplicate',
				use: 'Use',
				continue: 'Continue',
				failed: 'Unavailable',
				retry: 'Retry',
				skip: 'Skip',
				checking: 'Checking',
				loadFailed: 'Load failed',
			},
		});
		window.fetch = jest.fn();
		controller.init();
	});

	afterEach(() => {
		jest.clearAllTimers();
		jest.useRealTimers();
		jest.restoreAllMocks();
	});

	it('discards a stale match response after the name changes', async () => {
		let finish!: (value: unknown) => void;
		(fetch as jest.Mock)
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						finish = resolve;
					}),
			)
			.mockResolvedValueOnce({ ok: true, json: async () => [] });
		name.value = 'Hallen';
		const stale = controller.checkName();
		name.value = 'En annan plats';
		name.dispatchEvent(new Event('input'));
		expect(await controller.checkName()).toBe(true);
		finish({ ok: true, json: async () => [place] });
		expect(await stale).toBe(false);
		expect(document.querySelector('.mod-frontend-form__location-notice')!.textContent).toBe('');
	});

	it('offers a duplicate with its address and can switch to the existing place', async () => {
		(fetch as jest.Mock)
			.mockResolvedValueOnce({ ok: true, json: async () => [place] })
			.mockResolvedValueOnce({ ok: true, json: async () => place });
		name.value = 'hallen';
		expect(await controller.checkName()).toBe(false);
		expect(form.textContent).toContain('Hallen – Gatan 1');
		[...form.querySelectorAll('button')].find((button) => button.textContent === 'Use')!.click();
		expect(await beforeProceed(form, form)).toBe(true);
		expect(select.value).toBe('7');
		expect(loadAddress).toHaveBeenCalledWith(
			expect.objectContaining({ name: 'Hallen', address: { '@type': 'PostalAddress', name: 'Gatan 1' } }),
		);
	});

	it('allows an explicit choice to continue with a new place', async () => {
		(fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => [place] });
		name.value = 'Hallen';
		await controller.checkName();
		[...form.querySelectorAll('button')].find((button) => button.textContent === 'Continue')!.click();
		expect(await controller.checkName()).toBe(true);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('requires an explicit choice before bypassing an unavailable match service', async () => {
		(fetch as jest.Mock).mockRejectedValue(new Error('Unavailable'));
		name.value = 'Ny plats';
		expect(await controller.checkName()).toBe(false);
		[...form.querySelectorAll('button')].find((button) => button.textContent === 'Skip')!.click();
		expect(await controller.checkName()).toBe(true);
	});
});

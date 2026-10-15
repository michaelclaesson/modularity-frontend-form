import SelectFactory from './selectFactory';
import Select from './select';

it('supports an initially empty place register and options added after initialization', () => {
	const field = document.createElement('div');
	field.innerHTML = '<select required></select>';
	const instance = SelectFactory.create(field, 'place', [], {} as NoticeInterface, '0');
	expect(instance).toBeInstanceOf(Select);
	const select = instance as SelectInterface;
	expect(select.getOptions()).toHaveLength(0);
	select.getField().add(new Option('Hallen – Gatan 1', '7'));
	expect(select.getOptions()).toHaveLength(1);
	select.getField().add(new Option('Choose a place', '', true, true), 0);
	select.getField().value = '';
	expect(select.getSelectedOptions()).toEqual([]);
});

it('keeps the dropdown anchored to the control when validation adds a notice', () => {
	const field = document.createElement('div');
	field.innerHTML =
		'<label>Place</label><div class="c-select__field-container"><select required><option value=""></option></select><div class="c-field__inner"></div></div><div class="c-select__dropdown"></div>';
	const notice = document.createElement('div');
	notice.innerHTML = '<span data-js-frontend-form-notice-message></span>';
	const select = SelectFactory.create(
		field,
		'place',
		[],
		{ getErrorNotice: () => notice, getSuccessNotice: () => document.createElement('div') },
		'0',
	);
	select.init({ build: () => [] } as unknown as ConditionBuilderInterface);
	expect(select.getValidator().validate()).toBe(false);
	expect(field.querySelector('.c-select__dropdown')!.parentElement).toBe(
		field.querySelector('.c-select__field-container'),
	);
	expect(notice.parentElement).toBe(field);
});

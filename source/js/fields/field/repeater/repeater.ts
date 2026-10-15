import RepeaterValueLoader from './load/repeaterValueLoader';

class Repeater implements RepeaterInterface {
	private required: boolean = false;
	private minRows: number = 0;
	private maxRows: number = 0;

	constructor(
		private field: HTMLElement,
		private name: string,
		private repeaterUI: RepeaterUIInterface,
		private conditionValidator: ConditionValidatorInterface,
		private conditionsHandler: ConditionsHandlerInterface,
		private validator: FieldValidatorInterface,
		private loader: RepeaterValueLoaderInterface = new RepeaterValueLoader(repeaterUI),
	) {}

	public init(conditionBuilder: ConditionBuilderInterface): void {
		this.required = this.field.hasAttribute('data-js-required');
		this.minRows = parseInt(this.field.getAttribute('data-js-min-rows') ?? '0');
		this.maxRows = parseInt(this.field.getAttribute('data-js-max-rows') ?? '100');
		this.repeaterUI.init(this, conditionBuilder);
		this.conditionsHandler.init(this, conditionBuilder);
		this.conditionValidator.init(this);
		this.validator.init(this);
		this.loader.init(this);
		this.listenForChanges();
	}

	public getName(): string {
		return this.name;
	}

	public getConditionsHandler(): ConditionsHandlerInterface {
		return this.conditionsHandler;
	}

	public getConditionValidator(): ConditionValidatorInterface {
		return this.conditionValidator;
	}

	public getValidator(): FieldValidatorInterface {
		return this.validator;
	}

	public hasValue(): boolean {
		return this.repeaterUI.getRowCount() > 0;
	}

	public getMinRows(): number {
		return this.minRows;
	}

	public getMaxRows(): number {
		return this.maxRows;
	}

	public getRowCount(): number {
		return this.repeaterUI.getRowCount();
	}

	public isRequired(): boolean {
		return this.required;
	}

	public getFieldContainer(): HTMLElement {
		return this.field;
	}

	public getValueLoader(): RepeaterValueLoaderInterface {
		return this.loader;
	}

	private listenForChanges(): void {
		this.repeaterUI.addRowChangeListener((rowCount: number) => {
			this.validator.validate();
		});
	}
}

export default Repeater;

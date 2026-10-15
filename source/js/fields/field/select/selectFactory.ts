import FieldValidator from "../../validation/fieldValidator";
import FieldValidatorUIHandler from "../../validation/UI/fieldValidatorUIHandler";
import BasicConditionsHandler from "../basic/condition/basicConditionHandler";
import HtmlValidator from "../basic/validation/htmlValidator";
import NullFieldFactory from "../nullField/nullFieldFactory";
import SelectConditionValidator from "./condition/selectConditionValidator";
import Select from "./select";

class SelectFactory {
	public static create(
		field: HTMLElement,
		name: string,
		unstructuredConditions: any,
		notices: NoticeInterface,
		stepId: string,
	): FieldInterface {
		const select = field.querySelector("select") as HTMLSelectElement;
		const options = select?.querySelectorAll(
			"option",
		) as NodeListOf<HTMLOptionElement>;

		if (!select || !options) {
			console.error("Select field is missing select element or options");
			return NullFieldFactory.create(
				field,
				"select",
				name,
				unstructuredConditions,
				notices,
				stepId,
			);
		}

		return new Select(
			field,
			select,
			options,
			name,
			new SelectConditionValidator(),
			new BasicConditionsHandler(unstructuredConditions),
			new FieldValidator(new FieldValidatorUIHandler(notices), [
				new HtmlValidator(),
			]),
		);
	}
}

export default SelectFactory;

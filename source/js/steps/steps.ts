import beforeProceed from '../validation/beforeProceed';
import StepNavigator from './stepNavigator';
import StepUIManager from './stepUIManager';

class Steps implements StepsInterface {
	private checking: boolean = false;
	private editableSteps: { [key: number]: boolean } = {};

	constructor(
		private steps: StepsObject,
		private stepNavigator: StepNavigator,
		private stepUIManager: StepUIManager,
		private nextButton: HTMLButtonElement,
		private previousButton: HTMLButtonElement,
		private formId: number,
	) {}

	public init() {
		this.editableSteps[this.stepNavigator.getActiveStepIndex()] = true;
		this.setupPrevious();
		this.setupNext();
		this.setupEdit();
		this.setupPopstate();
		this.updateUrlWithStep(this.stepNavigator.getActiveStepIndex(), true);
	}

	private setupEdit() {
		for (const step of Object.values(this.steps)) {
			if (!step.getEditItem()) continue;
			step.getEditItem()!.addEventListener('click', (e) => {
				e.preventDefault();
				if (step.getId() === this.stepNavigator.getActiveStepIndex()) return;
				if (!this.editableSteps[step.getId()]) return;
				const currentStep = this.stepNavigator.getActiveStep();
				const nextStep = this.stepNavigator.goTo(step.getId());
				this.stepUIManager.handleValidity(currentStep, currentStep.validate());

				if (nextStep) {
					this.handleMove(currentStep, nextStep);
				}
			});
		}
	}

	private setupNext() {
		this.nextButton.addEventListener('click', async (e) => {
			e.preventDefault();
			if (this.checking) return;
			const currentStep = this.stepNavigator.getActiveStep();
			this.checking = true;
			this.nextButton.disabled = true;
			let proceed = false;
			try {
				proceed = await beforeProceed(
					this.nextButton.closest('form') ?? this.nextButton.closest('[data-js-frontend-form]')!,
					currentStep.getStepContainer(),
				);
			} finally {
				this.checking = false;
				this.nextButton.disabled = false;
			}
			if (!proceed || currentStep !== this.stepNavigator.getActiveStep()) return;
			const stepIsValid = currentStep.validate();

			this.stepUIManager.handleValidity(currentStep, stepIsValid, true);

			if (!stepIsValid) {
				this.stepUIManager.triggerErrorAnimation(currentStep);
				return;
			}

			const nextStep = this.stepNavigator.goNext();
			if (nextStep) {
				this.editableSteps[nextStep.getId()] = true;
				this.handleMove(currentStep, nextStep);
			}
		});
	}

	private setupPrevious() {
		this.previousButton.addEventListener('click', (e) => {
			e.preventDefault();

			const currentStep = this.stepNavigator.getActiveStep();
			const previousStep = this.stepNavigator.goPrevious();
			const stepIsValid = currentStep.validate();
			this.stepUIManager.handleValidity(currentStep, stepIsValid);

			if (previousStep) {
				this.handleMove(currentStep, previousStep);
			}
		});
	}

	private handleMove(currentStep: StepInterface, nextStep: StepInterface): void {
		this.stepUIManager.updateButtonStates(nextStep.getId(), currentStep.getId());

		this.stepUIManager.showAndHideSteps(nextStep, currentStep);
		this.updateUrlWithStep(nextStep.getId());
	}

	private setupPopstate(): void {
		window.addEventListener('popstate', () => {
			const url = new URL(window.location.href);
			const paramName = `${this.formId}-step`;
			const stepParam = url.searchParams.get(paramName);
			if (stepParam === null) return;

			const targetStepIndex = parseInt(stepParam, 10) - 1;
			if (Number.isNaN(targetStepIndex)) return;

			const currentStep = this.stepNavigator.getActiveStep();
			const targetStep = this.stepNavigator.goTo(targetStepIndex);

			if (targetStep) {
				this.stepUIManager.updateButtonStates(targetStep.getId(), currentStep.getId());
				this.stepUIManager.showAndHideSteps(targetStep, currentStep);
			}
		});
	}

	private updateUrlWithStep(stepIndex: number, replace: boolean = false): void {
		const url = new URL(window.location.href);
		const paramName = `${this.formId}-step`;
		url.searchParams.set(paramName, String(stepIndex + 1));
		if (replace) {
			window.history.replaceState({}, '', url.toString());
		} else {
			window.history.pushState({}, '', url.toString());
		}
	}
}

export default Steps;

import beforeProceed from '../validation/beforeProceed';
import AsyncNonce from '../asyncNonce/asyncNonce';
import StatusHandler from '../formStatus/handler';
import { SubmitStatus } from '../formStatus/enum';
import Form from '../form/form';
import FormMode from '../form/formModeEnum';
import StatusRendererInterface from '../formStatus/renderInterface';

class Submit implements SubmitInterface {
	private submitting = false;
	constructor(
		private form: Form,
		private modularityFrontendFormData: ModularityFrontendFormData,
		private modularityFrontendFormLang: ModularityFrontendFormLang,
		private asyncNonce: AsyncNonce,
		private statusHandler: StatusHandler,
		private statusRenderer: StatusRendererInterface,
	) {
		this.disableFormSubmission();
	}

	public retry(): void {
		this.statusRenderer.reset();
		this.submit();
	}

	public return(): void {
		this.statusRenderer.reset();
	}

	/**
	 * Disable the form submission to prevent default behavior.
	 */
	private disableFormSubmission(): void {
		const message = 'Form submission is disabled';
		this.form.formElement.addEventListener('submit', (e) => {
			console.warn(message);
			e.preventDefault();
		});

		this.form.formElement.submit = function () {
			console.warn(message);
			return;
		};
	}

	/**
	 * Setup the submit functionality.
	 * @param form The form element to be submitted.
	 *
	 * @returns A promise that resolves when the form is submitted.
	 */
	public async submit(): Promise<void> {
		if (this.submitting) return;
		this.submitting = true;
		try {
			if (await beforeProceed(this.form.formElement, this.form.formElement)) {
				await this.send();
			}
		} finally {
			this.submitting = false;
		}
	}

	private async send(): Promise<void> {
		// this.statusHandler.setCurrentAction();
		// Set the initial status to working
		this.statusHandler.setStatus(
			SubmitStatus.Working,
			this.modularityFrontendFormLang?.submitInit ?? 'Submitting your form, please wait...',
			'send',
			10,
		);

		// Respect the form mode, set endpoint accordingly
		const url =
			this.form.mode === FormMode.Post
				? this.modularityFrontendFormData.apiRoutes?.submitForm
				: this.form.mode === FormMode.Update
					? this.modularityFrontendFormData.apiRoutes?.updateForm
					: null;

		if (!url) {
			this.statusHandler.setStatus(
				SubmitStatus.Error,
				this.modularityFrontendFormLang?.submitUrlError ??
					'Could not find the submit URL. Please check your configuration.',
				'link_off',
				0,
				4000,
				this,
				this,
			);
			return;
		}

		const nonce = await this.asyncNonce.get(this.statusHandler, this.form.formId);

		try {
			const urlWithParams = new URL(url);

			//Module ID
			urlWithParams.searchParams.append('module-id', this.form.formId.toString());

			//Nonce
			urlWithParams.searchParams.append('nonce', nonce?.toString() || '');

			//Post ID of current page (holding post)
			urlWithParams.searchParams.append('holding-post-id', (this.form.holdingPostId ?? 0).toString());

			//If in update mode, append postId & token to the URL
			if (this.form.mode === FormMode.Update && this.form.formUpdateId) {
				const token = (() => {
					const urlParams = new URLSearchParams(window.location.search);
					return urlParams.get('token') ?? null;
				})();
				if (token) {
					urlWithParams.searchParams.append('token', token);
				}
				urlWithParams.searchParams.append('post-id', this.form.formUpdateId.toString());
			}

			const finalUrl = urlWithParams.toString();

			const response = await fetch(finalUrl, {
				method: 'POST',
				body: new FormData(this.form.formElement),
			});

			const json = await response.json();

			// Failed
			if (!response.ok) {
				if (json.code == 'invalid_field_values') {
					this.statusHandler.setStatus(
						SubmitStatus.Error,
						json?.message ?? this.modularityFrontendFormLang?.submitError,
						'data_alert',
						0,
						2000,
						this,
						this,
					);
					return;
				}

				this.statusHandler.setStatus(
					SubmitStatus.Error,
					json?.message ?? this.modularityFrontendFormLang?.submitError,
					'error',
					0,
					3000,
					this,
					this,
				);
				return;
			}

			// Success
			if (response.ok) {
				this.statusHandler.setStatus(
					SubmitStatus.Success,
					this.modularityFrontendFormLang?.submitSuccess ??
						'Form submitted successfully! Thank you for your submission.',
					'celebration',
					100,
					4000,
					this,
					false,
				);
			}
		} catch (error: any) {
			console.error('Error submitting form:', error);
			this.statusHandler.setStatus(
				SubmitStatus.Error,
				this.modularityFrontendFormLang?.submitError ??
					'Form submission failed. Please try again.' + (error?.message ? ` (${error.message})` : ''),
				'error',
				0,
				4000,
				this,
				this,
			);
		}
	}
}
export default Submit;

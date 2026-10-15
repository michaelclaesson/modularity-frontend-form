import type { ProceedDetail } from '../validation/beforeProceed';

type LinkedLocationConfig = {
	sourceField: string;
	nameField: string;
	addressField: string;
	attendanceField: string;
	termsUrl: string;
	matchesUrl: string;
	strings: Record<string, string>;
};

type RegisteredPlace = {
	id: number;
	name: string;
	place: { name: string; address: string; latitude: number; longitude: number };
};

/** Configured by the domain plugin through the selector's ACF settings. */
export default class LinkedLocation {
	private source: RadioInterface;
	private name: BasicInterface;
	private address: GoogleMapInterface;
	private attendance: RadioInterface;
	private select: HTMLSelectElement;
	private notice = document.createElement('div');
	private summary = document.createElement('p');
	private checkedName = '';
	private acceptedName = '';
	private revision = 0;
	private selectionRevision = 0;
	private pending: Promise<boolean> | null = null;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private selected: Promise<void> = Promise.resolve();
	private selectionValid = false;
	private legacyAllowed = false;

	constructor(
		private form: HTMLFormElement,
		private selector: SelectInterface,
		fields: FieldsObject,
		private config: LinkedLocationConfig,
	) {
		this.source = fields[config.sourceField] as RadioInterface;
		this.name = fields[config.nameField] as BasicInterface;
		this.address = fields[config.addressField] as GoogleMapInterface;
		this.attendance = fields[config.attendanceField] as RadioInterface;
		this.select = selector.getField();
	}

	public init(): void {
		if (!this.source || !this.name || !this.address || !this.attendance) return;
		this.notice.className = 'mod-frontend-form__location-notice';
		this.notice.setAttribute('aria-live', 'polite');
		this.name.getFieldContainer().append(this.notice);
		this.summary.className = 'mod-frontend-form__location-summary';
		this.summary.setAttribute('aria-live', 'polite');
		this.address.getFieldContainer().prepend(this.summary);
		this.source.getFieldContainer().addEventListener('change', () => this.updateMode());
		this.attendance.getFieldContainer().addEventListener('change', () => this.updateMode());
		this.select.addEventListener('change', () => {
			this.selected = this.loadSelected();
		});
		this.name.getField().addEventListener('input', () => {
			this.revision++;
			this.checkedName = '';
			this.acceptedName = '';
			this.pending = null;
			this.notice.replaceChildren();
			clearTimeout(this.timer);
			this.timer = setTimeout(() => {
				void this.checkName();
			}, 400);
		});
		this.form.addEventListener('modularity-frontend-form:populated', () => {
			this.updateMode();
			this.selected = this.loadSelected();
		});
		this.form.addEventListener('modularity-frontend-form:beforeProceed', (event) => {
			const { scope, waitUntil } = (event as CustomEvent<ProceedDetail>).detail;
			if (!scope.contains(this.source.getFieldContainer()) || this.isOnline()) return;
			waitUntil(this.beforeProceed());
		});
		this.updateMode();
	}

	private mode(): string {
		return this.source.getSelectedChoice();
	}
	private isOnline(): boolean {
		return this.attendance.getSelectedChoice() === 'online';
	}
	private normalizedName(): string {
		return this.name.getField().value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
	}

	private updateMode(): void {
		const existing = this.mode() === 'existing';
		if (this.mode() === 'legacy') this.legacyAllowed = true;
		this.address.getFieldContainer().toggleAttribute('inert', existing && !this.isOnline());
		this.address.getFieldContainer().classList.toggle('mod-frontend-form__location-readonly', existing);
		this.name.getField().required = this.mode() === 'new' && !this.isOnline();
		for (const choice of this.source.getChoices()) {
			if (choice.value === 'legacy') {
				const wrapper = choice.closest('.c-option') ?? choice.closest('label') ?? choice.parentElement;
				if (wrapper) {
					(wrapper as HTMLElement).hidden = !this.legacyAllowed;
					wrapper.classList.toggle('u-display--none', !this.legacyAllowed);
				}
			}
		}
		if (!existing || this.isOnline()) {
			this.summary.textContent = '';
			this.selectionValid = false;
			this.selectionRevision++;
		} else if (this.select.value && !this.selectionValid) {
			this.selected = this.loadSelected();
		}
		if (this.mode() !== 'new' || this.isOnline()) {
			this.revision++;
			this.pending = null;
			this.notice.replaceChildren();
		}
	}

	private async beforeProceed(): Promise<boolean> {
		if (this.mode() === 'existing') {
			if (!this.select.value) return true;
			await this.selected;
			return this.selectionValid;
		}
		return this.checkName();
	}

	private async fetchJson(url: string): Promise<unknown> {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 8000);
		try {
			const response = await fetch(url, { signal: controller.signal });
			if (!response.ok) throw new Error('Location request failed');
			return await response.json();
		} finally {
			clearTimeout(timeout);
		}
	}

	private async loadSelected(): Promise<void> {
		const revision = ++this.selectionRevision;
		this.selectionValid = false;
		this.summary.textContent = '';
		if (!this.select.value || this.mode() !== 'existing' || this.isOnline()) return;
		this.summary.textContent = this.config.strings.checking;
		try {
			const term = (await this.fetchJson(
				`${this.config.termsUrl}/${encodeURIComponent(this.select.value)}`,
			)) as RegisteredPlace;
			if (revision !== this.selectionRevision) return;
			if (
				!term.place ||
				!term.place.address ||
				!Number.isFinite(Number(term.place.latitude)) ||
				!Number.isFinite(Number(term.place.longitude))
			) {
				throw new Error('Invalid location');
			}
			this.address.getValueLoader().load({
				...term.place,
				address: { '@type': 'PostalAddress', name: term.place.address },
			});
			this.selectionValid = true;
			this.summary.textContent = '';
		} catch {
			if (revision !== this.selectionRevision) return;
			this.summary.textContent = this.config.strings.loadFailed;
		}
	}

	public checkName(force = false): Promise<boolean> {
		if (this.mode() !== 'new' || this.isOnline()) return Promise.resolve(true);
		const name = this.normalizedName();
		if (!name || name === this.checkedName || name === this.acceptedName) return Promise.resolve(true);
		if (this.pending && !force) return this.pending;
		const revision = ++this.revision;
		this.notice.textContent = this.config.strings.checking;
		const url = new URL(this.config.matchesUrl, window.location.href);
		url.searchParams.set('name', this.name.getField().value);
		const pending = this.fetchJson(url.toString())
			.then((result) => {
				if (revision !== this.revision) return false;
				if (!Array.isArray(result)) throw new Error('Invalid matches');
				if (result.length === 0) {
					this.checkedName = name;
					this.notice.replaceChildren();
					return true;
				}
				this.showMatches(result, name);
				return false;
			})
			.catch(() => {
				if (revision !== this.revision) return false;
				this.notice.replaceChildren(document.createTextNode(this.config.strings.failed));
				this.button(this.config.strings.retry, () => {
					void this.checkName(true);
				});
				this.button(this.config.strings.skip, () => {
					this.acceptedName = name;
					this.notice.replaceChildren();
				});
				return false;
			})
			.finally(() => {
				if (this.pending === pending) this.pending = null;
			});
		this.pending = pending;
		return pending;
	}

	private showMatches(matches: RegisteredPlace[], name: string): void {
		this.notice.replaceChildren(document.createTextNode(this.config.strings.duplicate));
		for (const match of matches) {
			const text = document.createElement('p');
			text.textContent = `${match.name} – ${match.place.address}`;
			this.notice.append(text);
			this.button(this.config.strings.use, () => {
				if (![...this.select.options].some((option) => option.value === String(match.id))) {
					this.select.add(new Option(`${match.name} – ${match.place.address}`, String(match.id)));
				}
				this.source.getValueLoader().load('existing');
				this.source.getConditionsHandler().checkConditions();
				this.updateMode();
				this.selector.getValueLoader().load(match.id);
				this.select.focus();
			});
		}
		this.button(this.config.strings.continue, () => {
			this.acceptedName = name;
			this.notice.replaceChildren();
		});
	}

	private button(label: string, action: () => void): void {
		const button = document.createElement('button');
		button.type = 'button';
		button.textContent = label;
		button.className = 'c-button c-button__outlined c-button__outlined--primary c-button--sm';
		button.addEventListener('click', action);
		this.notice.append(button);
	}
}

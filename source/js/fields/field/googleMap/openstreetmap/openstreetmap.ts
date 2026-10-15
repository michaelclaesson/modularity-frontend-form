import {
	MarkerInterface,
	CreateMarker,
	CreateTileLayer,
	TilesHelper,
	CreateAttribution,
	CreateMarkerInterface,
	MapInterface,
	PlaceObject,
	EventData,
	LatLngObject,
	CreateMap,
	CreateSearch,
	SearchInterface,
} from '@helsingborg-stad/openstreetmap';

import FetchPlaceFromLatLng from './fetchPlaceFromLatLng';
import CreateFallbackPlaceObject from './createFallbackPlaceObject';
import { MarkerChangedCallback, OpenstreetmapInterface } from './openstreetmapInterface';

class Openstreetmap implements OpenstreetmapInterface {
	private search!: SearchInterface;
	private marker: MarkerInterface | null = null;
	private map!: MapInterface;
	private createMarker!: CreateMarkerInterface;
	private markerMovedListeners: MarkerChangedCallback[] = [];
	private fetching: boolean = false;
	private currentPlace: PlaceObject | null = null;

	constructor(
		private fetchPlaceFromLatLng: FetchPlaceFromLatLng,
		private createPlaceFromLatLng: CreateFallbackPlaceObject,
		private modularityFrontendFormData: ModularityFrontendFormData,
		private modularityFrontendFormLang: ModularityFrontendFormLang,
		private parent: HTMLElement,
		private id: string,
		private lat: number,
		private lng: number,
		private zoom: number,
	) {}

	public init(): void {
		this.map = new CreateMap({
			id: this.id,
			center: {
				lat: this.lat,
				lng: this.lng,
			},
			zoom: this.zoom,
		}).create();

		this.createMarker = new CreateMarker();

        const style = this.modularityFrontendFormData.mapStyle;
        const mapStyle = style === 'dark' || style === 'pale' || style === 'color' ? style : 'default';
        const tiles = new TilesHelper().getDefaultTiles(mapStyle);
		new CreateAttribution().create().setPrefix(tiles.attribution).addTo(this.map);
		new CreateTileLayer().create().setUrl(tiles.url).addTo(this.map);
		this.search = new CreateSearch()
			.create({
				noResultsText: this.modularityFrontendFormLang.noResultsFound ?? 'No items found.',
				placeholder: this.modularityFrontendFormLang.searchPlaceholder ?? 'Search location...',
			})
			.setApiUrl(this.modularityFrontendFormData.placeSearchApiUrl)
			.setSearchParam('q')
			.addTo(this.map)
			.addListItemListener((e) => this.handleListItemClick(e));

		// Invalidate size due to the container changing in size
		setTimeout(() => {
			this.map.invalidateSize();
		}, 100);

		this.map.addListener('click', (e) => this.handleClick(e));
		this.setResetButtonClickListener();
	}

	public getMap(): MapInterface {
		return this.map;
	}

	public hasPlaceData(): boolean {
		return this.currentPlace !== null;
	}

	public getMarker(): MarkerInterface | null {
		return this.marker ?? null;
	}

	public isFetchingPlace(): boolean {
		return this.fetching;
	}

	public addMarkerMovedListener(callback: (event: PlaceObject | null) => void): void {
		this.markerMovedListeners.push(callback);
	}

	private handleClick(e: EventData): void {
		if (!e.latLng) {
			console.error('No latLng found in event data');
			return;
		}

		if (!e.originalEvent) {
			console.error('No originalEvent found in event data');
			return;
		}

		if (e.originalEvent.target && e.originalEvent.target.classList.contains('mod-frontend-form__openstreetmap')) {
			this.addOrMoveMarker(e.latLng);
		}
	}

	private setResetButtonClickListener(): void {
		this.search.getResetButton()?.addEventListener('click', () => {
			this.marker?.removeMarker();
			this.marker = null;
			this.currentPlace = null;
			this.callMarkerMovedListeners();
		});
	}

	private handleListItemClick(item: PlaceObject): void {
		const latLng = {
			lat: (item.latitude as number) ?? 0,
			lng: (item.longitude as number) ?? 0,
		};

		this.addOrMoveMarker(latLng, item);
		this.map.flyTo(latLng, 15);
	}

	public addOrMoveMarker(latLng: LatLngObject, placeObject: PlaceObject | null = null): void {
		if (this.marker) {
			this.marker.setPosition(latLng);
		} else {
			this.marker = this.createMarker.create({
				html: this.getIconHtml(),
				position: latLng,
			});

			this.marker.addTo(this.map);
		}

		this.maybeFetchPlace(latLng, placeObject);
	}

	private callMarkerMovedListeners(): void {
		this.markerMovedListeners.forEach((callback) => {
			callback(this.currentPlace);
		});
	}

	private async maybeFetchPlace(latLng: LatLngObject, placeObject: PlaceObject | null = null): Promise<void> {
		if (placeObject) {
			this.currentPlace = placeObject;
			this.callMarkerMovedListeners();
			this.updateSearchInput();

			return;
		}

		this.fetching = true;
		if (this.search.getInput()) {
			this.search.setValue((this.modularityFrontendFormLang.loading ?? 'Loading') + '...');
			this.search.showSpinner();
		}

		try {
			this.currentPlace = await this.fetchPlaceFromLatLng.fetch(latLng.lat, latLng.lng);
			if (this.currentPlace) this.callMarkerMovedListeners();
			this.updateSearchInput();
		} catch (error) {
			this.currentPlace = this.createPlaceFromLatLng.create(latLng);
			this.callMarkerMovedListeners();
			this.updateSearchInput();
			console.warn('Failed to fetch place:', error);
		} finally {
			this.fetching = false;
		}
	}

	// Updates the search input to show the fetched place
	private updateSearchInput(): void {
		if (this.search.getInput() && this.currentPlace) {
			this.search.setSearchListItems(null);
			this.search.getInput()!.value = this.search.getTitleFromPlaceSchema(this.currentPlace);
			this.search.showResetButton();
			this.search.hideSpinner();

			setTimeout(() => {
				this.search.getInput()!.scrollLeft = 0;
			}, 0);
		}
	}

	private getIconHtml(): string {
		return `<span data-material-symbol="location_on" class="mod-frontend-form__openstreetmap-icon material-symbols material-symbols-rounded material-symbols-sharp material-symbols-outlined material-symbols--filled"></span>`;
	}
}

export default Openstreetmap;

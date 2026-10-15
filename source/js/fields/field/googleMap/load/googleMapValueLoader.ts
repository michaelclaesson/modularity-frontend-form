import { LatLngObject, PlaceObject } from '@helsingborg-stad/openstreetmap';

class GoogleMapValueLoader implements GoogleMapValueLoaderInterface {
	private parent!: GoogleMapInterface;

	public init(parent: GoogleMapInterface): void {
		this.parent = parent;
	}

	public load(value: any): void {
		if (this.isNotAValidPlaceObject(value)) {
			console.error('Invalid place object provided to GoogleMapValueLoader:', value);
			return;
		}

		this.parent.getOpenstreetmap().addOrMoveMarker(
			{
				lat: value.latitude,
				lng: value.longitude,
			} as LatLngObject,
			value,
		);

		this.parent
			.getOpenstreetmap()
			.getMap()
			.setView(
				{
					lat: value.latitude,
					lng: value.longitude,
				} as LatLngObject,
				14,
			);
	}

	private isNotAValidPlaceObject(value: any): boolean {
		if (
			!value ||
			typeof value !== 'object' ||
			!value.address ||
			value.latitude == null ||
			value.longitude == null ||
			!Number.isFinite(Number(value.latitude)) ||
			!Number.isFinite(Number(value.longitude)) ||
			!value.name
		) {
			return true;
		}

		return false;
	}
}

export default GoogleMapValueLoader;

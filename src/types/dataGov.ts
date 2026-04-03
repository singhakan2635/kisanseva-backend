/** Mandi/market price record from data.gov.in */
export interface MandiPrice {
  state: string;
  district: string;
  market: string;
  commodity: string;
  variety: string;
  arrivalDate: string;
  minPrice: number;
  maxPrice: number;
  modalPrice: number;
}

/** Crop production statistics from data.gov.in */
export interface CropProduction {
  state: string;
  district: string;
  crop: string;
  season: string;
  area: number;
  production: number;
  yield: number;
}

/** Market/mandi info */
export interface Market {
  name: string;
  state: string;
  district: string;
}

/** Raw record shape from mandi prices API */
export interface RawMandiRecord {
  state: string;
  district: string;
  market: string;
  commodity: string;
  variety: string;
  arrival_date: string;
  min_price: string;
  max_price: string;
  modal_price: string;
}

/** Raw record shape from crop production API */
export interface RawCropRecord {
  state_name: string;
  district_name: string;
  crop: string;
  season: string;
  area: string;
  production: string;
  yield: string;
}

/** data.gov.in API envelope */
export interface DataGovResponse<T> {
  status: string;
  message: string;
  total: number;
  count: number;
  records: T[];
}

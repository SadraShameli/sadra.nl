import { db } from '..';
import { reading } from '../schema';

export default async function ReadingSeed() {
  return await db.insert(reading).values([
    {
      value: 29.17,
      sensor_id: 1,
      device_id: 1,
      location_id: 1,
    },
    {
      value: 57.64,
      sensor_id: 2,
      device_id: 1,
      location_id: 1,
    },
    {
      value: 1004.46,
      sensor_id: 3,
      device_id: 1,
      location_id: 1,
    },
    {
      value: 66.06,
      sensor_id: 4,
      device_id: 1,
      location_id: 1,
    },
    {
      value: 73.27,
      sensor_id: 5,
      device_id: 1,
      location_id: 1,
    },
    {
      value: 74,
      sensor_id: 6,
      device_id: 1,
      location_id: 1,
    },
    {
      value: 2731,
      sensor_id: 8,
      device_id: 1,
      location_id: 1,
    },
  ]);
}

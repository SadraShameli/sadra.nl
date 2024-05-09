-- CreateEnum
CREATE TYPE "SensorTypes" AS ENUM ('Temperature', 'Humidity', 'GasResistance', 'AirPressure', 'Altitude', 'Sound', 'RPM');

-- CreateEnum
CREATE TYPE "DeviceTypes" AS ENUM ('Sound', 'Sensor');

-- CreateTable
CREATE TABLE "Sensor" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "SensorTypes" NOT NULL,
    "unit" TEXT NOT NULL,
    "sensor_id" INTEGER NOT NULL,

    CONSTRAINT "Sensor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "location_name" TEXT NOT NULL,
    "location_id" INTEGER NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "type" "DeviceTypes" NOT NULL,
    "device_id" INTEGER NOT NULL,
    "register_interval" INTEGER NOT NULL,
    "loudness_threshold" INTEGER NOT NULL,
    "locationId" INTEGER NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadingRecord" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "value" INTEGER NOT NULL,
    "sensorId" INTEGER NOT NULL,
    "deviceId" INTEGER NOT NULL,

    CONSTRAINT "ReadingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoundRecord" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceId" INTEGER NOT NULL,
    "file" BYTEA NOT NULL,

    CONSTRAINT "SoundRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Sensor_type_key" ON "Sensor"("type");

-- CreateIndex
CREATE UNIQUE INDEX "Sensor_sensor_id_key" ON "Sensor"("sensor_id");

-- CreateIndex
CREATE UNIQUE INDEX "Location_location_name_key" ON "Location"("location_name");

-- CreateIndex
CREATE UNIQUE INDEX "Location_location_id_key" ON "Location"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "Device_device_id_key" ON "Device"("device_id");

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingRecord" ADD CONSTRAINT "ReadingRecord_sensorId_fkey" FOREIGN KEY ("sensorId") REFERENCES "Sensor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingRecord" ADD CONSTRAINT "ReadingRecord_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoundRecord" ADD CONSTRAINT "SoundRecord_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

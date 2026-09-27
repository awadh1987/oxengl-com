const axios = require('axios');
require('dotenv').config();

const WASL_BASE_URL = process.env.WASL_BASE_URL || 'https://wasl.elm.sa/api';
const WASL_CLIENT_ID = process.env.WASL_CLIENT_ID || '';
const WASL_APP_ID = process.env.WASL_APP_ID || '';
const WASL_APP_KEY = process.env.WASL_APP_KEY || '';

const IS_MOCK_MODE =
  process.env.WASL_MOCK_MODE === 'true' ||
  !WASL_APP_KEY ||
  WASL_APP_KEY.includes('YourWasl');

class WaslClient {
  constructor() {
    this.http = axios.create({
      baseURL: WASL_BASE_URL,
      timeout: 10000,
      headers: {
        'client-id': WASL_CLIENT_ID,
        'app-id': WASL_APP_ID,
        'app-key': WASL_APP_KEY,
        'Content-Type': 'application/json',
      },
    });
  }

  async registerVehicle(data) {
    const { sequenceNumber, plateLetterRight, plateLetterMiddle, plateLetterLeft, plateNumber } = data;

    if (IS_MOCK_MODE) {
      console.log(`[WASL MOCK] Registered vehicle with Sequence: ${sequenceNumber}`);
      return {
        success: true,
        mock: true,
        referenceKey: `WASL-VEH-${Date.now()}-${sequenceNumber || 'TEST'}`,
        status: 'REGISTERED',
        sequenceNumber,
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const resp = await this.http.post('/vehicles', {
        sequenceNumber,
        plateLetterRight,
        plateLetterMiddle,
        plateLetterLeft,
        plateNumber,
      });
      return { success: true, data: resp.data };
    } catch (err) {
      console.error(`[WASL API] Vehicle registration error for ${sequenceNumber}:`, err.message);
      throw err;
    }
  }

  async validateDriver(data) {
    const { identityNumber, mobileNumber } = data;

    if (IS_MOCK_MODE) {
      console.log(`[WASL MOCK] Validated driver Iqama/National ID: ${identityNumber}`);
      return {
        success: true,
        mock: true,
        referenceKey: `WASL-DRV-${Date.now()}-${identityNumber}`,
        status: 'VALID',
        eligibility: true,
        identityNumber,
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const resp = await this.http.post('/drivers/validate', {
        identityNumber,
        mobileNumber,
      });
      return { success: true, data: resp.data };
    } catch (err) {
      console.error(`[WASL API] Driver validation error for ${identityNumber}:`, err.message);
      throw err;
    }
  }

  async sendTelemetryPing(data) {
    const { sequenceNumber, latitude, longitude, speed, heading, timestamp } = data;

    if (IS_MOCK_MODE) {
      console.log(
        `[WASL MOCK] Telemetry Ping -> Seq: ${sequenceNumber} | Lat: ${latitude} Lon: ${longitude} Speed: ${speed} km/h`
      );
      return {
        success: true,
        mock: true,
        trackingId: `WASL-TRK-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        sequenceNumber,
        receivedAt: new Date().toISOString(),
      };
    }

    try {
      const resp = await this.http.post('/tracking', {
        sequenceNumber,
        latitude,
        longitude,
        speed,
        heading,
        timestamp: timestamp || new Date().toISOString(),
      });
      return { success: true, data: resp.data };
    } catch (err) {
      console.error(`[WASL API] Telemetry ping error for ${sequenceNumber}:`, err.message);
      throw err;
    }
  }
}

const waslClient = new WaslClient();
module.exports = { WaslClient, waslClient };

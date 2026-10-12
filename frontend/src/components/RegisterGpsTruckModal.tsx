import React, { useState } from 'react';
import {
  Truck,
  Radio,
  ThermometerSnowflake,
  MapPin,
  X,
  CheckCircle,
  AlertCircle,
  Cpu,
  User,
  Navigation,
  BatteryCharging,
  Gauge,
  Droplets,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { erpApi } from '../services/api';

interface RegisterGpsTruckModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTruckRegistered: (truck: any) => void;
}

export const RegisterGpsTruckModal: React.FC<RegisterGpsTruckModalProps> = ({
  isOpen,
  onClose,
  onTruckRegistered,
}) => {
  const { language, showToast } = useApp();
  const isAr = language === 'ar';

  const [plateNumber, setPlateNumber] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [imei, setImei] = useState('');
  const [carrierName, setCarrierName] = useState('أسطول النقل المتقدم اللوجستي');
  const [driverNameAr, setDriverNameAr] = useState('');
  const [driverNameEn, setDriverNameEn] = useState('');
  const [destinationAr, setDestinationAr] = useState('');
  const [destinationEn, setDestinationEn] = useState('');
  const [minTemp, setMinTemp] = useState('0.0');
  const [maxTemp, setMaxTemp] = useState('4.2');
  const [initialLat, setInitialLat] = useState('24.7136');
  const [initialLng, setInitialLng] = useState('46.6753');
  const [speed, setSpeed] = useState('65.0');
  const [cargoTemp, setCargoTemp] = useState('2.8');
  const [humidity, setHumidity] = useState('45.0');
  const [batteryVoltage, setBatteryVoltage] = useState('12.4');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleApplyPreset = (lat: string, lng: string, destAr: string, destEn: string) => {
    setInitialLat(lat);
    setInitialLng(lng);
    setDestinationAr(destAr);
    setDestinationEn(destEn);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!plateNumber.trim()) {
      setError(isAr ? 'يرجى إدخال رقم لوحة الشاحنة' : 'License plate number is required');
      return;
    }
    if (!imei.trim()) {
      setError(isAr ? 'يرجى إدخال معرّف جهاز التتبع / IMEI' : 'GPS Tracker IMEI is required');
      return;
    }

    setSubmitting(true);
    try {
      const generatedId = vehicleId.trim() || `V-${Math.floor(1000 + Math.random() * 9000)}`;
      const payload = {
        plate_number: plateNumber.trim(),
        vehicle_id: generatedId,
        carrier_name: carrierName.trim(),
        imei: imei.trim(),
        driver_name_ar: driverNameAr.trim() || (isAr ? 'سائق معتمد' : 'Authorized Driver'),
        driver_name_en: driverNameEn.trim() || 'Authorized Driver',
        destination_ar: destinationAr.trim() || (isAr ? 'مسار عمليات النقل المركزية' : 'Central Logistics Hub'),
        destination_en: destinationEn.trim() || 'Central Logistics Hub',
        min_temp: parseFloat(minTemp) || 0.0,
        max_temp: parseFloat(maxTemp) || 4.2,
        initial_lat: parseFloat(initialLat) || 24.7136,
        initial_lng: parseFloat(initialLng) || 46.6753,
        speed: parseFloat(speed) || 65.0,
        cargo_temp: parseFloat(cargoTemp) || 2.8,
        ambient_humidity: parseFloat(humidity) || 45.0,
        device_battery_voltage: parseFloat(batteryVoltage) || 12.4,
      };

      const res = await erpApi.registerFleetTruck(payload);

      showToast(
        isAr
          ? `تم تسجيل الشاحنة ${payload.vehicle_id} وتفعيل رادار التتبع المباشر بنجاح`
          : `GPS Truck ${payload.vehicle_id} registered and live radar activated successfully`,
        'success'
      );

      onTruckRegistered({
        vehicleId: res?.vehicle_id || payload.vehicle_id,
        driverNameAr: payload.driver_name_ar,
        driverNameEn: payload.driver_name_en,
        plateNumber: payload.plate_number,
        destinationAr: payload.destination_ar,
        destinationEn: payload.destination_en,
        lat: payload.initial_lat,
        lng: payload.initial_lng,
        speedKph: payload.speed,
        tempCelsius: payload.cargo_temp,
        humidityPct: payload.ambient_humidity,
        batteryVoltage: payload.device_battery_voltage,
        lastUpdated: Date.now(),
        minTemp: payload.min_temp,
        maxTemp: payload.max_temp,
      });

      onClose();
    } catch (err: any) {
      console.error('Failed to register fleet truck:', err);
      const errMsg = err?.message || (isAr ? 'فشل تسجيل الشاحنة، يرجى المحاولة لاحقاً' : 'Registration failed');
      setError(errMsg);
      showToast(errMsg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-3xl rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden my-8">
        {/* Accent gradient bar */}
        <div className="h-1.5 w-full bg-linear-to-r from-emerald-500 via-cyan-500 to-orange-500" />

        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 p-5 sm:p-6 bg-slate-950/60">
          <div className="flex items-center gap-3.5">
            <div className="h-12 w-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Radio className="h-6 w-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-white">
                  {isAr ? 'تسجيل شاحنة برادار التتبع المباشر' : 'Register GPS Truck on Live Radar'}
                </h2>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  {isAr ? 'تتبع فوري' : 'Live Telematics'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {isAr
                  ? 'ربط معرّف الجهاز (IMEI) ومستشعرات سلسلة التبريد بالخريطة التفاعلية الفورية'
                  : 'Link hardware tracker IMEI and cold-chain telematics to the live radar map'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-6">
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300 animate-shake">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Section 1: Identification & Hardware */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Truck className="h-4 w-4 text-orange-400" />
              {isAr ? 'معلومات المركبة ووحدة التتبع' : 'Vehicle & Hardware Transponder'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  {isAr ? 'رقم اللوحة *' : 'Plate Number *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={isAr ? 'مثال: 3190-ر س ب' : 'e.g. 3190-RSB'}
                  value={plateNumber}
                  onChange={(e) => setPlateNumber(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white placeholder-slate-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-hidden"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  {isAr ? 'معرّف الشاحنة' : 'Vehicle Code'}
                  <span className="text-[10px] text-emerald-400 ms-1">({isAr ? 'توليد تلقائي' : 'Auto'})</span>
                </label>
                <input
                  type="text"
                  disabled={true}
                  placeholder={isAr ? 'يتم التوليد تلقائياً عند الحفظ' : 'Auto-generated upon save'}
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs font-mono text-slate-400 placeholder-slate-500 cursor-not-allowed opacity-75 outline-hidden"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  {isAr ? 'رقم جهاز التتبع (IMEI) *' : 'GPS Tracker IMEI *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={isAr ? 'مثال: 864201048123456' : 'e.g. 864201048123456'}
                  value={imei}
                  onChange={(e) => setImei(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white placeholder-slate-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-hidden"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                {isAr ? 'جهة النقل / مقاول الشحن' : 'Carrier / Logistics Transporter'}
              </label>
              <input
                type="text"
                placeholder={isAr ? 'اسم شركة النقل أو الأسطول' : 'Carrier or Transporter Name'}
                value={carrierName}
                onChange={(e) => setCarrierName(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-hidden"
              />
            </div>
          </div>

          {/* Section 2: Driver & Destination */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <User className="h-4 w-4 text-cyan-400" />
              {isAr ? 'بيانات السائق ومسار الرحلة' : 'Driver & Destination Route'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  {isAr ? 'اسم السائق (بالعربية)' : 'Driver Name (Arabic)'}
                </label>
                <input
                  type="text"
                  placeholder={isAr ? 'مثال: سلطان العتيبي' : 'Sultan Al-Otaibi'}
                  value={driverNameAr}
                  onChange={(e) => setDriverNameAr(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-hidden"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  {isAr ? 'اسم السائق (بالإنجليزية)' : 'Driver Name (English)'}
                </label>
                <input
                  type="text"
                  placeholder={isAr ? 'سلطان العتيبي' : 'e.g. Sultan Al-Otaibi'}
                  value={driverNameEn}
                  onChange={(e) => setDriverNameEn(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-hidden"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  {isAr ? 'الوجهة المجدولة (بالعربية)' : 'Destination (Arabic)'}
                </label>
                <input
                  type="text"
                  placeholder={isAr ? 'مثال: مشروع بوابة الدرعية - الموقع B' : 'Diriyah Gate Project - Site B'}
                  value={destinationAr}
                  onChange={(e) => setDestinationAr(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-hidden"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  {isAr ? 'الوجهة المجدولة (بالإنجليزية)' : 'Destination (English)'}
                </label>
                <input
                  type="text"
                  placeholder={isAr ? 'مشروع بوابة الدرعية - الموقع B' : 'e.g. Diriyah Gate Project - Site B'}
                  value={destinationEn}
                  onChange={(e) => setDestinationEn(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Cold-Chain SLA & Geo-Location */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <ThermometerSnowflake className="h-4 w-4 text-blue-400" />
              {isAr ? 'معايير سلسلة التبريد والموقع الجغرافي' : 'Cold-Chain SLA & Geo Coordinates'}
            </h3>

            {/* Quick location presets */}
            <div className="flex flex-wrap items-center gap-2 pt-1 pb-1">
              <span className="text-[11px] font-bold text-slate-400">
                {isAr ? 'مواقع مقترحة سريعة:' : 'Quick Presets:'}
              </span>
              <button
                type="button"
                onClick={() =>
                  handleApplyPreset(
                    '24.7136',
                    '46.6753',
                    'طريق الخرج - محطة يوني بيتون',
                    'Al-Kharj Road Batching Plant'
                  )
                }
                className="px-2.5 py-1 rounded-lg border border-slate-800 bg-slate-950/80 text-[11px] text-slate-300 hover:border-emerald-500 hover:text-white transition"
              >
                {isAr ? 'الرياض - طريق الخرج' : 'Riyadh Al-Kharj'}
              </button>
              <button
                type="button"
                onClick={() =>
                  handleApplyPreset(
                    '24.7450',
                    '46.7020',
                    'مشروع القدية - البوابة الشرقية',
                    'Qiddiya Project East Gate'
                  )
                }
                className="px-2.5 py-1 rounded-lg border border-slate-800 bg-slate-950/80 text-[11px] text-slate-300 hover:border-emerald-500 hover:text-white transition"
              >
                {isAr ? 'القدية' : 'Qiddiya'}
              </button>
              <button
                type="button"
                onClick={() =>
                  handleApplyPreset(
                    '24.7680',
                    '46.6430',
                    'مركز الملك عبدالله المالي (KAFD)',
                    'King Abdullah Financial District'
                  )
                }
                className="px-2.5 py-1 rounded-lg border border-slate-800 bg-slate-950/80 text-[11px] text-slate-300 hover:border-emerald-500 hover:text-white transition"
              >
                {isAr ? 'مركز KAFD' : 'KAFD'}
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  {isAr ? 'خط العرض (Lat)' : 'Latitude'}
                </label>
                <input
                  type="number"
                  step="any"
                  value={initialLat}
                  onChange={(e) => setInitialLat(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white focus:border-blue-500 outline-hidden"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  {isAr ? 'خط الطول (Lng)' : 'Longitude'}
                </label>
                <input
                  type="number"
                  step="any"
                  value={initialLng}
                  onChange={(e) => setInitialLng(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white focus:border-blue-500 outline-hidden"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  {isAr ? 'أدنى حرارة (°C)' : 'Min Temp (°C)'}
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={minTemp}
                  onChange={(e) => setMinTemp(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white focus:border-blue-500 outline-hidden"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  {isAr ? 'أقصى حرارة (°C)' : 'Max Temp (°C)'}
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={maxTemp}
                  onChange={(e) => setMaxTemp(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white focus:border-blue-500 outline-hidden"
                />
              </div>
            </div>

            {/* Initial Telemetry Readings */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1 flex items-center gap-1">
                  <Gauge className="h-3 w-3 text-emerald-400" />
                  {isAr ? 'السرعة (km/h)' : 'Speed (km/h)'}
                </label>
                <input
                  type="number"
                  step="1"
                  value={speed}
                  onChange={(e) => setSpeed(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white focus:border-emerald-500 outline-hidden"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1 flex items-center gap-1">
                  <ThermometerSnowflake className="h-3 w-3 text-cyan-400" />
                  {isAr ? 'حرارة الحمولة (°C)' : 'Cargo Temp (°C)'}
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={cargoTemp}
                  onChange={(e) => setCargoTemp(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white focus:border-cyan-500 outline-hidden"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1 flex items-center gap-1">
                  <Droplets className="h-3 w-3 text-blue-400" />
                  {isAr ? 'الرطوبة (%)' : 'Humidity (%)'}
                </label>
                <input
                  type="number"
                  step="1"
                  value={humidity}
                  onChange={(e) => setHumidity(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white focus:border-blue-500 outline-hidden"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1 flex items-center gap-1">
                  <BatteryCharging className="h-3 w-3 text-yellow-400" />
                  {isAr ? 'بطارية الجهاز (V)' : 'Battery (V)'}
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={batteryVoltage}
                  onChange={(e) => setBatteryVoltage(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white focus:border-yellow-500 outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-white transition"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-linear-to-r from-emerald-600 to-teal-600 text-xs font-black text-white hover:from-emerald-500 hover:to-teal-500 transition shadow-lg shadow-emerald-950/50 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>{isAr ? 'جاري التسجيل والتفعيل...' : 'Registering Transponder...'}</span>
                </>
              ) : (
                <>
                  <Radio className="h-4 w-4" />
                  <span>{isAr ? 'تسجيل وتفعيل التتبع المباشر' : 'Register & Activate Radar'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

import { useState } from 'react';
import { Cpu, Clock, AlertTriangle, TrendingUp, ChevronRight } from 'lucide-react';
import Header from '../components/Header';
import { RiskBadge } from '../components/StatusBadge';
import { generateMockDeliveries } from '../data/mockData';
import type { ETAPredictionResponse, RiskAnalysisResponse, TrafficLevel, WeatherCondition, RiskLevel } from '../types/api';
import { aiApi } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

interface ETAFormState {
  deliveryId: string;
  distance: number;
  driverDistance: number;
  averageSpeed: number;
  trafficLevel: TrafficLevel;
  packageWeight: number;
}

interface RiskFormState {
  deliveryId: string;
  driverDistance: number;
  trafficLevel: TrafficLevel;
  packageWeight: number;
  weatherCondition: WeatherCondition;
}

const MOCK_DELIVERIES = generateMockDeliveries(10);

// Fallback local calculations used only when AI service is unreachable
function _localPredictETA(form: ETAFormState): ETAPredictionResponse {
  const trafficMultiplier = { LOW: 0.8, MEDIUM: 1.0, HIGH: 1.4 }[form.trafficLevel];
  const weightPenalty = form.packageWeight > 20 ? 1.1 : 1.0;
  const base = ((form.distance + form.driverDistance) / form.averageSpeed) * 60;
  const etaMinutes = Math.round(base * trafficMultiplier * weightPenalty);
  const confidence = parseFloat((0.95 - (trafficMultiplier - 1) * 0.2).toFixed(2));
  return { deliveryId: form.deliveryId, etaMinutes, confidence };
}

function _localAnalyzeRisk(form: RiskFormState): RiskAnalysisResponse {
  const reasons: string[] = [];
  let score = 0;
  if (form.driverDistance > 5) { reasons.push(`Driver is ${form.driverDistance.toFixed(1)} km from pickup`); score += 2; }
  if (form.trafficLevel === 'HIGH') { reasons.push('Traffic level is high'); score += 3; }
  else if (form.trafficLevel === 'MEDIUM') { reasons.push('Moderate traffic conditions'); score += 1; }
  if (form.packageWeight > 30) { reasons.push(`Heavy package (${form.packageWeight} kg)`); score += 2; }
  if (form.weatherCondition !== 'CLEAR') { reasons.push(`Weather condition: ${form.weatherCondition}`); score += 2; }
  const risk: RiskLevel = score >= 5 ? 'HIGH' : score >= 2 ? 'MEDIUM' : 'LOW';
  return { deliveryId: form.deliveryId, risk, reasons };
}

export default function AIInsightsPage() {
  const { addToast } = useToast();
  const { isDemoMode } = useAuth();

  const [etaForm, setEtaForm] = useState<ETAFormState>({
    deliveryId: MOCK_DELIVERIES[0].id,
    distance: 5.2,
    driverDistance: 2.1,
    averageSpeed: 25,
    trafficLevel: 'MEDIUM',
    packageWeight: 1.5,
  });
  const [etaResult, setEtaResult] = useState<ETAPredictionResponse | null>(null);
  const [etaLoading, setEtaLoading] = useState(false);

  const [riskForm, setRiskForm] = useState<RiskFormState>({
    deliveryId: MOCK_DELIVERIES[1].id,
    driverDistance: 2.1,
    trafficLevel: 'MEDIUM',
    packageWeight: 1.5,
    weatherCondition: 'CLEAR',
  });
  const [riskResult, setRiskResult] = useState<RiskAnalysisResponse | null>(null);
  const [riskLoading, setRiskLoading] = useState(false);

  const handleETA = async (e: React.FormEvent) => {
    e.preventDefault();
    setEtaLoading(true);
    try {
      if (isDemoMode) throw new Error('demo');
      const res = await aiApi.predictETA(etaForm.deliveryId, {
        distance: etaForm.distance,
        driverDistance: etaForm.driverDistance,
        averageSpeed: etaForm.averageSpeed,
        trafficLevel: etaForm.trafficLevel,
        packageWeight: etaForm.packageWeight,
      });
      setEtaResult(res.data);
    } catch {
      // Fallback to local calculation
      setEtaResult(_localPredictETA(etaForm));
      if (!isDemoMode) addToast('warning', 'AI service unreachable — using local estimate');
    } finally {
      setEtaLoading(false);
    }
  };

  const handleRisk = async (e: React.FormEvent) => {
    e.preventDefault();
    setRiskLoading(true);
    try {
      if (isDemoMode) throw new Error('demo');
      const res = await aiApi.analyzeRisk(riskForm.deliveryId, {
        driverDistance: riskForm.driverDistance,
        trafficLevel: riskForm.trafficLevel,
        packageWeight: riskForm.packageWeight,
        weatherCondition: riskForm.weatherCondition,
      });
      setRiskResult(res.data);
    } catch {
      setRiskResult(_localAnalyzeRisk(riskForm));
      if (!isDemoMode) addToast('warning', 'AI service unreachable — using local estimate');
    } finally {
      setRiskLoading(false);
    }
  };

  const confidenceColor = (c: number) =>
    c >= 0.85 ? 'var(--accent-emerald)' : c >= 0.6 ? 'var(--accent-amber)' : 'var(--accent-rose)';

  return (
    <div>
      <Header title="AI Insights" subtitle="ETA prediction and risk analysis powered by AI" />
      <div className="page-content">
        {/* Header banner */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(6,182,212,0.1))',
            border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: 'var(--radius-lg)',
            padding: '20px 24px',
            marginBottom: 24,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <Cpu size={28} color="var(--brand-400)" />
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>AI-Powered Analytics</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              {isDemoMode
                ? 'Running in demo mode — using local calculation fallback. Connect backend for GPT-4 predictions.'
                : 'POST /api/v1/ai/deliveries/{id}/eta · POST /api/v1/ai/deliveries/{id}/risk'}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 20 }}>
            {[{ label: 'Model', value: isDemoMode ? 'Local' : 'GPT-4' }, { label: 'Accuracy', value: isDemoMode ? 'Est.' : '93.2%' }, { label: 'Latency', value: isDemoMode ? 'N/A' : '<50ms' }].map((s) => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--brand-300)' }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* ETA Prediction */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'linear-gradient(135deg, var(--brand-600), var(--accent-cyan))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Clock size={18} color="#fff" />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>ETA Prediction</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>POST /api/v1/ai/deliveries/{'{id}'}/eta</div>
              </div>
            </div>

            <form onSubmit={handleETA}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="input-group">
                  <label className="input-label">Delivery ID</label>
                  <select
                    id="eta-delivery-id"
                    className="input"
                    value={etaForm.deliveryId}
                    onChange={(e) => setEtaForm({ ...etaForm, deliveryId: e.target.value })}
                  >
                    {MOCK_DELIVERIES.map((d) => (
                      <option key={d.id} value={d.id}>{d.id.slice(0, 12)}... ({d.status})</option>
                    ))}
                  </select>
                </div>

                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="input-group">
                    <label className="input-label">Distance (km)</label>
                    <input id="eta-distance" type="number" step="0.1" min="0" className="input" value={etaForm.distance} onChange={(e) => setEtaForm({ ...etaForm, distance: parseFloat(e.target.value) })} />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Driver Distance (km)</label>
                    <input id="eta-driver-dist" type="number" step="0.1" min="0" className="input" value={etaForm.driverDistance} onChange={(e) => setEtaForm({ ...etaForm, driverDistance: parseFloat(e.target.value) })} />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Avg Speed (km/h)</label>
                    <input id="eta-speed" type="number" min="1" max="120" className="input" value={etaForm.averageSpeed} onChange={(e) => setEtaForm({ ...etaForm, averageSpeed: parseFloat(e.target.value) })} />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Weight (kg)</label>
                    <input id="eta-weight" type="number" step="0.1" min="0" className="input" value={etaForm.packageWeight} onChange={(e) => setEtaForm({ ...etaForm, packageWeight: parseFloat(e.target.value) })} />
                  </div>
                </div>

                <div className="input-group">
                  <label className="input-label">Traffic Level</label>
                  <select id="eta-traffic" className="input" value={etaForm.trafficLevel} onChange={(e) => setEtaForm({ ...etaForm, trafficLevel: e.target.value as TrafficLevel })}>
                    {(['LOW', 'MEDIUM', 'HIGH'] as TrafficLevel[]).map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <button id="btn-predict-eta" type="submit" className="btn btn-primary" disabled={etaLoading} style={{ marginTop: 4 }}>
                  {etaLoading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <TrendingUp size={14} />}
                  Predict ETA
                </button>
              </div>
            </form>

            {etaResult && (
              <div
                style={{
                  marginTop: 16,
                  background: 'rgba(99,102,241,0.08)',
                  border: '1px solid rgba(99,102,241,0.25)',
                  borderRadius: 10,
                  padding: 16,
                  animation: 'fadeIn 0.3s ease',
                }}
              >
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  {isDemoMode ? 'Local Estimate' : 'AI Prediction Result'}
                </div>
                <div style={{ display: 'flex', gap: 20 }}>
                  <div>
                    <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--brand-300)', lineHeight: 1 }}>
                      {etaResult.etaMinutes}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>minutes</div>
                  </div>
                  <div style={{ paddingTop: 4 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Confidence</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: confidenceColor(etaResult.confidence) }}>
                      {(etaResult.confidence * 100).toFixed(0)}%
                    </div>
                    <div style={{ marginTop: 6, height: 5, background: 'var(--bg-border)', borderRadius: 4, width: 100, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${etaResult.confidence * 100}%`, background: confidenceColor(etaResult.confidence), borderRadius: 4 }} />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Risk Analysis */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'linear-gradient(135deg, var(--accent-rose), var(--accent-amber))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertTriangle size={18} color="#fff" />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Risk Analysis</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>POST /api/v1/ai/deliveries/{'{id}'}/risk</div>
              </div>
            </div>

            <form onSubmit={handleRisk}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="input-group">
                  <label className="input-label">Delivery ID</label>
                  <select id="risk-delivery-id" className="input" value={riskForm.deliveryId} onChange={(e) => setRiskForm({ ...riskForm, deliveryId: e.target.value })}>
                    {MOCK_DELIVERIES.map((d) => (
                      <option key={d.id} value={d.id}>{d.id.slice(0, 12)}... ({d.status})</option>
                    ))}
                  </select>
                </div>

                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="input-group">
                    <label className="input-label">Driver Distance (km)</label>
                    <input id="risk-driver-dist" type="number" step="0.1" min="0" className="input" value={riskForm.driverDistance} onChange={(e) => setRiskForm({ ...riskForm, driverDistance: parseFloat(e.target.value) })} />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Package Weight (kg)</label>
                    <input id="risk-weight" type="number" step="0.1" min="0" className="input" value={riskForm.packageWeight} onChange={(e) => setRiskForm({ ...riskForm, packageWeight: parseFloat(e.target.value) })} />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Traffic Level</label>
                    <select id="risk-traffic" className="input" value={riskForm.trafficLevel} onChange={(e) => setRiskForm({ ...riskForm, trafficLevel: e.target.value as TrafficLevel })}>
                      {(['LOW', 'MEDIUM', 'HIGH'] as TrafficLevel[]).map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="input-group">
                    <label className="input-label">Weather</label>
                    <select id="risk-weather" className="input" value={riskForm.weatherCondition} onChange={(e) => setRiskForm({ ...riskForm, weatherCondition: e.target.value as WeatherCondition })}>
                      {(['CLEAR', 'RAIN', 'SNOW', 'FOG'] as WeatherCondition[]).map((w) => <option key={w} value={w}>{w}</option>)}
                    </select>
                  </div>
                </div>

                <button id="btn-analyze-risk" type="submit" className="btn btn-primary" style={{ background: 'linear-gradient(135deg, #e11d48, #d97706)', marginTop: 4 }} disabled={riskLoading}>
                  {riskLoading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <AlertTriangle size={14} />}
                  Analyze Risk
                </button>
              </div>
            </form>

            {riskResult && (
              <div
                style={{
                  marginTop: 16,
                  background: 'rgba(244,63,94,0.06)',
                  border: '1px solid rgba(244,63,94,0.2)',
                  borderRadius: 10,
                  padding: 16,
                  animation: 'fadeIn 0.3s ease',
                }}
              >
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  {isDemoMode ? 'Local Risk Estimate' : 'Risk Assessment Result'}
                </div>
                <div style={{ marginBottom: 12 }}>
                  <RiskBadge risk={riskResult.risk} />
                </div>
                {riskResult.reasons.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Risk Factors:</div>
                    {riskResult.reasons.map((r, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                        <ChevronRight size={12} style={{ flexShrink: 0, marginTop: 2 }} />
                        {r}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

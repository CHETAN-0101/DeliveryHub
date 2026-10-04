import { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, Bot, User, Loader, Sparkles } from 'lucide-react';
import Header from '../components/Header';
import { aiApi } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  fromBackend?: boolean;
}

// Fallback canned responses used only when backend AI is unreachable
const CANNED_RESPONSES: Record<string, string> = {
  default: "I'm analyzing your delivery operations. Based on current data, I can see patterns in delivery delays and driver availability. Would you like me to suggest optimizations?",
  delay: "The delivery appears to be delayed due to high traffic conditions in the area. The driver was assigned 4.2 km away from the pickup location. I recommend pre-positioning drivers closer to high-demand zones during peak hours.",
  eta: "Based on current traffic (HIGH level) and the distance of 8.3 km, the estimated delivery time is 34 minutes with 87% confidence. Heavy package weight is adding approximately 3 minutes to the estimate.",
  driver: "Currently you have 5 available drivers in the Brooklyn area and 3 in Manhattan. Driver Carlos Rivera has the highest rating (4.9) and is closest to your pending delivery. I recommend assigning him immediately.",
  risk: "I've analyzed this delivery and classified it as MEDIUM risk. Key factors: driver is 5.1 km away from pickup and traffic is moderate. No weather concerns. Recommend pre-notifying the customer with estimated arrival window.",
  route: "Optimal route analysis: Via I-278 E, total 6.2 km, ETA 22 minutes. Alternative via Brooklyn Bridge adds 4 minutes but avoids toll. Traffic is clear on both routes.",
  performance: "Weekly performance summary: 847 deliveries completed (92% success rate), average ETA accuracy of 91%, top performer: Marcus Johnson with 67 deliveries and 4.8 rating.",
  hello: "Hello! I'm the DeliveryHub AI Assistant. I can help you with delivery tracking, driver assignment, ETA predictions, risk analysis, and operational insights. What would you like to know?",
  help: "I can help you with:\n• Explaining why a delivery is delayed\n• Analyzing delivery risk factors\n• Getting ETA predictions\n• Driver performance insights\n• Route optimization suggestions\n• Operational summaries and trends\n\nJust ask me anything about your deliveries!",
};

function _localGetResponse(question: string): string {
  const q = question.toLowerCase();
  if (q.includes('hello') || q.includes('hi') || q.includes('hey')) return CANNED_RESPONSES.hello;
  if (q.includes('help') || q.includes('what can')) return CANNED_RESPONSES.help;
  if (q.includes('delay') || q.includes('late') || q.includes('slow')) return CANNED_RESPONSES.delay;
  if (q.includes('eta') || q.includes('time') || q.includes('when')) return CANNED_RESPONSES.eta;
  if (q.includes('driver') || q.includes('assign')) return CANNED_RESPONSES.driver;
  if (q.includes('risk') || q.includes('danger') || q.includes('safe')) return CANNED_RESPONSES.risk;
  if (q.includes('route') || q.includes('path') || q.includes('direction')) return CANNED_RESPONSES.route;
  if (q.includes('performance') || q.includes('stats') || q.includes('summary') || q.includes('week')) return CANNED_RESPONSES.performance;
  return CANNED_RESPONSES.default;
}

const SUGGESTED_QUESTIONS = [
  'Why is delivery 3fa2... delayed?',
  'What is the ETA for my active deliveries?',
  'Which driver should I assign next?',
  'What is the risk level for current deliveries?',
  'Show me performance summary',
  'Suggest route optimization',
];

let _msgId = 0;
const _nextId = () => String(++_msgId);

export default function AIAssistantPage() {
  const { isDemoMode } = useAuth();
  const [messages, setMessages] = useState<Message[]>(() => [{
    id: '0',
    role: 'assistant',
    content: "Hello! I'm your DeliveryHub AI Assistant. I can help you analyze deliveries, predict ETAs, assess risks, and optimize your operations. How can I help you today?",
    timestamp: new Date().toISOString(),
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (question?: string) => {
    const text = (question || input).trim();
    if (!text || loading) return;

    const userMsg: Message = {
      id: _nextId(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      if (isDemoMode) throw new Error('demo');

      const res = await aiApi.askAssistant({ question: text });
      const aiMsg: Message = {
        id: _nextId(),
        role: 'assistant',
        content: res.data.answer,
        timestamp: new Date().toISOString(),
        fromBackend: true,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      // Fallback to local canned responses
      await new Promise((r) => setTimeout(r, 900 + Math.random() * 600));
      const aiMsg: Message = {
        id: _nextId(),
        role: 'assistant',
        content: _localGetResponse(text),
        timestamp: new Date().toISOString(),
        fromBackend: false,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Header title="AI Assistant" subtitle="Conversational AI for delivery operations intelligence" />
      <div className="page-content" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--header-height) - 48px)' }}>
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg-card)',
            border: '1px solid var(--bg-border)',
            borderRadius: 'var(--radius-xl)',
            overflow: 'hidden',
          }}
        >
          {/* Chat Header */}
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--bg-border)',
              background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(6,182,212,0.05))',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: 'linear-gradient(135deg, var(--brand-600), var(--accent-cyan))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                animation: 'pulse-glow 3s ease infinite',
              }}
            >
              <Sparkles size={18} color="#fff" />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>DeliveryHub AI</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-emerald)', display: 'inline-block', animation: 'dotPulse 2s infinite' }} />
                {isDemoMode ? 'Demo Mode · Local Responses' : 'Online · GPT-4 · POST /api/v1/ai/assistant'}
              </div>
            </div>
            {isDemoMode && (
              <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--accent-amber)', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 6, padding: '3px 10px' }}>
                ⚠ Demo Mode
              </div>
            )}
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                  animation: 'fadeIn 0.3s ease',
                }}
              >
                {/* Avatar */}
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: msg.role === 'assistant'
                      ? 'linear-gradient(135deg, var(--brand-600), var(--accent-cyan))'
                      : 'linear-gradient(135deg, var(--brand-700), var(--brand-500))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {msg.role === 'assistant' ? <Bot size={16} color="#fff" /> : <User size={16} color="#fff" />}
                </div>

                {/* Bubble */}
                <div style={{ maxWidth: '72%' }}>
                  <div
                    style={{
                      padding: '12px 16px',
                      borderRadius: msg.role === 'user' ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                      background: msg.role === 'user'
                        ? 'linear-gradient(135deg, var(--brand-600), var(--brand-700))'
                        : 'var(--bg-elevated)',
                      border: `1px solid ${msg.role === 'user' ? 'transparent' : 'var(--bg-border)'}`,
                      fontSize: 13,
                      lineHeight: 1.6,
                      color: 'var(--text-primary)',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {msg.content}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, textAlign: msg.role === 'user' ? 'right' : 'left', padding: '0 4px', display: 'flex', gap: 6, justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', alignItems: 'center' }}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {msg.role === 'assistant' && msg.fromBackend !== undefined && (
                      <span style={{ fontSize: 9, color: msg.fromBackend ? 'var(--accent-emerald)' : 'var(--text-muted)', background: msg.fromBackend ? 'rgba(16,185,129,0.1)' : 'var(--bg-elevated)', borderRadius: 4, padding: '1px 5px' }}>
                        {msg.fromBackend ? '⚡ GPT-4' : '📋 Local'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {loading && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', animation: 'fadeIn 0.3s ease' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, var(--brand-600), var(--accent-cyan))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Bot size={16} color="#fff" />
                </div>
                <div style={{ padding: '12px 16px', borderRadius: '4px 16px 16px 16px', background: 'var(--bg-elevated)', border: '1px solid var(--bg-border)' }}>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: 'var(--brand-400)',
                          display: 'inline-block',
                          animation: `dotPulse 1.2s ease ${i * 0.2}s infinite`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggested Questions */}
          {messages.length <= 1 && (
            <div style={{ padding: '0 20px 12px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  id={`suggest-${q.slice(0, 15).replace(/\W/g, '-')}`}
                  onClick={() => sendMessage(q)}
                  style={{
                    padding: '6px 12px',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--bg-border)',
                    borderRadius: 20,
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand-500)';
                    (e.currentTarget as HTMLElement).style.color = 'var(--brand-300)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--bg-border)';
                    (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div
            style={{
              padding: '16px 20px',
              borderTop: '1px solid var(--bg-border)',
              display: 'flex',
              gap: 10,
            }}
          >
            <MessageSquare size={14} style={{ display: 'none' }} />
            <input
              id="assistant-input"
              className="input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Ask about deliveries, ETAs, risk, driver performance..."
              disabled={loading}
              style={{ flex: 1 }}
            />
            <button
              id="btn-send-message"
              className="btn btn-primary"
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
            >
              {loading ? <Loader size={14} style={{ animation: 'spin 0.6s linear infinite' }} /> : <Send size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

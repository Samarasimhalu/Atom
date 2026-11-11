import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button.jsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import { Progress } from "@/components/ui/progress.jsx";
import { Alert, AlertDescription } from "@/components/ui/alert.jsx";
import { Mic, MicOff, RefreshCw, Sparkles, Volume2, Zap } from "lucide-react";

const SpeechRecognitionImpl =
  typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

function speak(text) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

/** Synthetic checkout traffic so the page can be demoed without the SDK installed. */
function demoEvents() {
  const events = [];
  const now = Date.now();
  for (let i = 0; i < 12; i += 1) {
    const sessionId = `demo-${now}-${i}`;
    const t = now - i * 1000;
    events.push(
      { type: "navigate", ts: t, sessionId, path: "/cart" },
      { type: "click", ts: t + 1, sessionId, path: "/cart", target: "checkout-btn" },
      { type: "navigate", ts: t + 2, sessionId, path: `/checkout/${1000 + i}` },
      { type: "submit", ts: t + 3, sessionId, path: `/checkout/${1000 + i}`, target: "pay" },
    );
    if (i % 4 === 0) events.push({ type: "error", ts: t + 4, sessionId, path: "/checkout/1", message: "3DS challenge failed" });
  }
  for (let i = 0; i < 5; i += 1) {
    const sessionId = `demo-search-${now}-${i}`;
    events.push(
      { type: "navigate", ts: now, sessionId, path: "/" },
      { type: "navigate", ts: now + 1, sessionId, path: "/search" },
      { type: "click", ts: now + 2, sessionId, path: "/search", target: "result-0" },
    );
  }
  return events;
}

export default function PulsePage({ apiBaseUrl, requestHeaders, onGenerateFromGap }) {
  const [data, setData] = useState({ realUserCoveragePercent: 0, gaps: [] });
  const [summary, setSummary] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  const api = useCallback(
    async (path, options = {}) => {
      const response = await fetch(`${apiBaseUrl}${path}`, { headers: requestHeaders, credentials: "include", ...options });
      if (!response.ok) throw new Error(`request_failed_${response.status}`);
      return response.json();
    },
    [apiBaseUrl, requestHeaders],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [gaps, sum] = await Promise.all([api("/api/pulse/gaps"), api("/api/pulse/summary")]);
      setData(gaps);
      setSummary(sum.text);
      setError(null);
      return { gaps, sum };
    } catch (e) {
      setError("Unable to load Pulse data. Check that the API is running and you have the pulse:read permission.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const loadDemo = async () => {
    try {
      await api("/api/pulse/events", { method: "POST", body: JSON.stringify({ events: demoEvents() }) });
      await refresh();
    } catch (e) {
      setError("Unable to load demo traffic. The pulse:ingest permission is required.");
    }
  };

  const handleVoiceCommand = useCallback(
    async (phrase) => {
      const text = phrase.toLowerCase();
      const fresh = await refresh();
      const gaps = fresh?.gaps.gaps ?? dataRef.current.gaps;
      let reply;
      if (/(generate|create|cover|write).*(test|top|journey|gap)/.test(text) && gaps[0]) {
        reply = "Opening the test workspace with a prompt for the riskiest untested journey. Review it before approval.";
        speak(reply);
        setSummary(reply);
        onGenerateFromGap(gaps[0].suggestedPrompt);
        return;
      }
      if (/(gap|untested|missing|risk)/.test(text)) {
        reply = gaps.length
          ? `There are ${gaps.length} untested journeys. The riskiest covers ${gaps[0].trafficShare} percent of sessions.`
          : "There are no untested journeys.";
      } else {
        reply = fresh?.sum.text || "I could not load coverage data.";
      }
      setSummary(reply);
      speak(reply);
    },
    [onGenerateFromGap, refresh],
  );

  const toggleListening = () => {
    if (!SpeechRecognitionImpl) return;
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new SpeechRecognitionImpl();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const phrase = event.results[0][0].transcript;
      setTranscript(phrase);
      handleVoiceCommand(phrase);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  useEffect(() => () => recognitionRef.current?.abort?.(), []);

  const { realUserCoveragePercent, gaps } = data;

  return (
    <div className="space-y-4" id="pulse">
      <section className="studio-heading workspace-page-heading">
        <div>
          <span className="eyebrow">REAL-USER COVERAGE &amp; VOICE COPILOT</span>
          <h1>Atom Pulse</h1>
          <p>Real-user coverage: the journeys your customers actually take, and which ones have no tests.</p>
        </div>
      </section>

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Real-user coverage</CardTitle>
            <CardDescription>Share of production sessions protected by tests</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-semibold">{realUserCoveragePercent}%</p>
            <Progress value={realUserCoveragePercent} aria-label="Real-user coverage" className="mt-3" />
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Volume2 size={18} aria-hidden="true" /> Hey Atom
            </CardTitle>
            <CardDescription>
              {SpeechRecognitionImpl
                ? 'Try: "How well are my customers covered?", "Which journeys are most at risk?", or "Write a test for my riskiest journey".'
                : "Voice input is not supported in this browser. Use the refresh button for a text summary."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p aria-live="polite" className="min-h-6">{summary || "No summary yet."}</p>
            {transcript && <p className="text-sm text-muted-foreground">You said: “{transcript}”</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={toggleListening} disabled={!SpeechRecognitionImpl} aria-pressed={listening}>
                {listening ? <MicOff size={16} aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}
                {listening ? "Stop listening" : "Talk to Atom"}
              </Button>
              <Button type="button" onClick={refresh} disabled={loading}>
                <RefreshCw size={16} aria-hidden="true" className={loading ? "animate-spin" : ""} /> Refresh
              </Button>
              <Button type="button" onClick={loadDemo}>
                <Sparkles size={16} aria-hidden="true" /> Load demo traffic
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Coverage gaps</CardTitle>
          <CardDescription>Untested journeys, ranked by traffic, error rate and revenue impact</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {gaps.length === 0 && <p>No gaps found. Ingest user events, or load demo traffic.</p>}
          {gaps.map((gap) => (
            <div key={gap.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>Risk {gap.riskScore}</Badge>
                <Badge variant="secondary">{gap.trafficShare}% of sessions</Badge>
                <Badge variant="secondary">{Math.round(gap.errorRate * 100)}% error rate</Badge>
                {gap.touchesMoney && <Badge variant="destructive">Revenue path</Badge>}
              </div>
              <ol className="list-decimal pl-5 text-sm">
                {gap.steps.map((step, i) => (
                  <li key={`${gap.id}-${i}`}>{step}</li>
                ))}
              </ol>
              <Button type="button" size="sm" onClick={() => onGenerateFromGap(gap.suggestedPrompt)}>
                <Zap size={14} aria-hidden="true" /> Generate test
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

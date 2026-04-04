function readSettings() {
  try {
    return JSON.parse(localStorage.getItem('adwaa_settings') || '{}');
  } catch {
    return {};
  }
}

function normalizeProvider(provider) {
  const p = String(provider || '').trim();
  if (!p) return 'huggingface_free';
  return p;
}

function getCloudConfig(settings = {}) {
  return {
    enabled: settings.aiCloudEnabled !== false,
    provider: normalizeProvider(settings.aiCloudProvider || 'huggingface_free'),
    model: String(settings.aiCloudModel || '').trim(),
    apiKey: String(settings.aiCloudApiKey || '').trim(),
    timeoutMs: Number(settings.aiCloudTimeoutMs || 15000) || 15000,
  };
}

function withTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('cloud-timeout')), timeoutMs);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

async function requestOpenRouter({ model, apiKey, systemPrompt, userPrompt, timeoutMs }) {
  const url = 'https://openrouter.ai/api/v1/chat/completions';
  const body = {
    model: model || 'meta-llama/llama-3.3-8b-instruct:free',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
    max_tokens: 450,
  };
  const res = await withTimeout(fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': window.location.origin || 'http://localhost',
      'X-Title': 'Adwaa POS',
    },
    body: JSON.stringify(body),
  }), timeoutMs);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, reason: 'cloud-failed', details: data?.error?.message || 'openrouter-error' };
  }
  const content = data?.choices?.[0]?.message?.content;
  if (!content) return { ok: false, reason: 'cloud-empty' };
  return { ok: true, text: String(content).trim() };
}

async function requestHuggingFace({ model, apiKey, systemPrompt, userPrompt, timeoutMs }) {
  const url = 'https://router.huggingface.co/v1/chat/completions';
  const body = {
    model: model || 'Qwen/Qwen2.5-7B-Instruct',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
    max_tokens: 450,
  };
  const res = await withTimeout(fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  }), timeoutMs);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, reason: 'cloud-failed', details: data?.error || data?.message || 'huggingface-error' };
  }
  const content = data?.choices?.[0]?.message?.content;
  if (!content) return { ok: false, reason: 'cloud-empty' };
  return { ok: true, text: String(content).trim() };
}

export async function askCloudAI({ question, contextText, canSeeProfit }) {
  const settings = readSettings();
  const cfg = getCloudConfig(settings);
  if (!cfg.enabled) return { ok: false, reason: 'cloud-disabled' };
  if (!cfg.apiKey) return { ok: false, reason: 'cloud-config-missing' };

  const systemPrompt = [
    'أنت مساعد محاسبي لنظام نقاط بيع.',
    'أجب بالعربية وبشكل عملي ومختصر.',
    'اعتمد فقط على البيانات المعطاة في السياق.',
    canSeeProfit
      ? 'يمكنك استخدام بيانات الربح لأنها مسموحة لهذا المستخدم.'
      : 'ممنوع عرض أو تحليل الربح لهذا المستخدم. إذا سُئلت عن الربح اعتذر وقدّم بدائل مثل المبيعات والمخزون والذمم.',
  ].join(' ');

  const userPrompt = `السؤال:\n${String(question || '').trim()}\n\nسياق البيانات:\n${String(contextText || '').trim()}`;
  if (cfg.provider === 'openrouter_free') {
    return requestOpenRouter({
      model: cfg.model,
      apiKey: cfg.apiKey,
      systemPrompt,
      userPrompt,
      timeoutMs: cfg.timeoutMs,
    });
  }
  return requestHuggingFace({
    model: cfg.model,
    apiKey: cfg.apiKey,
    systemPrompt,
    userPrompt,
    timeoutMs: cfg.timeoutMs,
  });
}

export function explainCloudAIError(result) {
  const reason = result?.reason || '';
  const details = result?.details ? `\n${result.details}` : '';
  if (reason === 'cloud-disabled') return 'الذكاء السحابي متوقف من الإعدادات.';
  if (reason === 'cloud-config-missing') return 'يرجى إدخال مفتاح API مجاني للذكاء السحابي من الإعدادات.';
  if (reason === 'cloud-timeout') return 'انتهت مهلة الاتصال بالذكاء السحابي. تم الرجوع للتحليل المحلي.';
  if (reason === 'cloud-empty') return 'الخدمة السحابية لم تُرجع إجابة. تم الرجوع للتحليل المحلي.';
  if (reason === 'cloud-failed') return `تعذر الاتصال بالذكاء السحابي.${details}`;
  return 'تعذر استخدام الذكاء السحابي حالياً.';
}


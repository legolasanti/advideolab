import axios from 'axios';
import FormData from 'form-data';
import { env } from '../config/env';

type InputAssets = {
  imageUrl?: string;
  thumbnailUrl?: string | null;
  referenceVideo?: string | null;
};

type N8nOptions = {
  file: Buffer;
  fileName: string;
  mimeType: string;
  jobId: string;
  tenantId: string;
  tenantName: string;
  tenantEmail: string;
  createdByEmail: string;
  webhookBase: string;
  scriptLanguage: string;
  platformFocus: string;
  vibe: string;
  voiceProfile: string;
  callToAction?: string | null;
  videoCount: number;
  creativeBrief?: string;
  creatorGender: string;
  creatorAgeRange: string;
  callbackUrl: string;
  callbackToken: string;
  apiKeyPayload?: Record<string, string>;
  inputAssets?: InputAssets;
  composition?: {
    useCloudinary: boolean;
    composeServiceUrl?: string;
    composeInternalToken?: string;
    cloudinary?: {
      cloudName: string;
      apiKey: string;
      apiSecret: string;
    };
  };
};

type TriggerWorkflowRequestOptions = {
  httpAgent?: any;
  httpsAgent?: any;
  timeoutMs?: number;
};

export const triggerWorkflow = async (
  url: string,
  options: N8nOptions,
  requestOptions: TriggerWorkflowRequestOptions = {},
): Promise<{ immediateOutputs?: any; acknowledged: boolean }> => {
  const normalizedCreativeBrief = options.creativeBrief ?? '';
  const normalizedCallToAction = options.callToAction ?? null;
  const uploadedImageUrl = options.inputAssets?.imageUrl ?? null;
  const payload = {
    job_id: options.jobId,
    tenant_id: options.tenantId,
    tenant_name: options.tenantName,
    tenant_email: options.tenantEmail,
    created_by_email: options.createdByEmail,
    webhook_base: options.webhookBase,
    script_language: options.scriptLanguage,
    selected_language: options.scriptLanguage,
    language: options.scriptLanguage,
    platform_focus: options.platformFocus,
    platform: options.platformFocus,
    vibe: options.vibe,
    voice_profile: options.voiceProfile,
    call_to_action: normalizedCallToAction,
    video_count: options.videoCount,
    creative_brief: normalizedCreativeBrief,
    creative_brief_text: normalizedCreativeBrief,
    creator_gender: options.creatorGender,
    creator_age_range: options.creatorAgeRange,
    callback_url: options.callbackUrl,
    callback_token: options.callbackToken,
    apikeys: options.apiKeyPayload ?? {},
    uploaded_image_url: uploadedImageUrl,
    input_assets: {
      image_url: uploadedImageUrl,
      thumbnail_url: options.inputAssets?.thumbnailUrl ?? null,
      reference_video: options.inputAssets?.referenceVideo ?? null,
    },
  };

  const form = new FormData();
  form.append('file', options.file, {
    filename: options.fileName,
    contentType: options.mimeType,
  });
  form.append('job_id', options.jobId);
  form.append('tenant_id', options.tenantId);
  form.append('tenant_name', options.tenantName);
  form.append('tenant_email', options.tenantEmail);
  form.append('created_by_email', options.createdByEmail);
  form.append('webhook_base', options.webhookBase);
  form.append('script_language', options.scriptLanguage);
  form.append('selected_language', options.scriptLanguage);
  form.append('language', options.scriptLanguage);
  form.append('platform_focus', options.platformFocus);
  form.append('platform', options.platformFocus);
  form.append('vibe', options.vibe);
  form.append('voice_profile', options.voiceProfile);
  if (normalizedCallToAction) {
    form.append('call_to_action', normalizedCallToAction);
  }
  form.append('video_count', String(options.videoCount));
  form.append('creative_brief', normalizedCreativeBrief);
  form.append('creator_gender', options.creatorGender);
  form.append('creator_age_range', options.creatorAgeRange);
  form.append('callback_url', options.callbackUrl);
  form.append('callback_token', options.callbackToken);
  form.append('payload', JSON.stringify(payload));
  form.append('apikeys', JSON.stringify(options.apiKeyPayload ?? {}));
  form.append('uploaded_image_url', uploadedImageUrl ?? '');
  form.append('input_assets', JSON.stringify(payload.input_assets));
  if (options.composition) {
    form.append('use_cloudinary', String(options.composition.useCloudinary));
    if (options.composition.composeServiceUrl) {
      form.append('compose_service_url', options.composition.composeServiceUrl);
    }
    if (options.composition.composeInternalToken) {
      form.append('compose_internal_token', options.composition.composeInternalToken);
    }
    if (options.composition.cloudinary) {
      form.append('cloudinary_cloud_name', options.composition.cloudinary.cloudName);
      form.append('cloudinary_api_key', options.composition.cloudinary.apiKey);
      form.append('cloudinary_api_secret', options.composition.cloudinary.apiSecret);
    }
  }

  const response = await axios.post(url, form, {
    headers: form.getHeaders(),
    timeout: requestOptions.timeoutMs ?? 60_000,
    httpAgent: requestOptions.httpAgent,
    httpsAgent: requestOptions.httpsAgent,
    proxy: false,
  });

  if (env.n8nSync && response.data?.outputs) {
    return { immediateOutputs: response.data.outputs, acknowledged: true };
  }

  return { acknowledged: true };
};

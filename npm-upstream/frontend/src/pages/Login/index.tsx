import { Field, Form, Formik } from "formik";
import { useEffect, useRef, useState } from "react";
import Alert from "react-bootstrap/Alert";
import { Button, Page, SiteFooter } from "src/components";
import { useAuthState } from "src/context";
import { intl, T } from "src/locale";
import { validateEmail, validateString } from "src/modules/Validations";
import AuthStore from "src/modules/AuthStore";
import { getSsoConfig, type SsoConfig } from "src/api/backend/getSsoConfig";
import styles from "./index.module.css";

function TwoFactorForm() {
	const codeRef = useRef<HTMLInputElement>(null);
	const [formErr, setFormErr] = useState("");
	const { verifyTwoFactor, cancelTwoFactor } = useAuthState();

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		setFormErr("");
		try {
			await verifyTwoFactor(values.code);
		} catch (err) {
			if (err instanceof Error) {
				setFormErr(err.message);
			}
		}
		setSubmitting(false);
	};

	useEffect(() => {
		codeRef.current?.focus();
	}, []);

	return (
		<>
			<h2 className="h2 text-center mb-4">
				<T id="login.2fa-title" />
			</h2>
			<p className="text-secondary text-center mb-4">
				<T id="login.2fa-description" />
			</p>
			{formErr !== "" && <Alert variant="danger">{formErr}</Alert>}
			<Formik initialValues={{ code: "" }} onSubmit={onSubmit}>
				{({ isSubmitting }) => (
					<Form>
						<div className="mb-3">
							<Field name="code" validate={validateString(6, 20)}>
								{({ field, form }: any) => (
									<label className="form-label">
										<T id="login.2fa-code" />
										<input
											{...field}
											ref={codeRef}
											type="text"
											inputMode="numeric"
											autoComplete="one-time-code"
											required
											maxLength={20}
											className={`form-control ${form.errors.code && form.touched.code ? "is-invalid" : ""}`}
											placeholder={intl.formatMessage({ id: "login.2fa-code-placeholder" })}
										/>
										<div className="invalid-feedback">{form.errors.code}</div>
									</label>
								)}
							</Field>
						</div>
						<div className="form-footer d-flex gap-2">
							<Button type="button" fullWidth onClick={cancelTwoFactor} disabled={isSubmitting}>
								<T id="cancel" />
							</Button>
							<Button type="submit" fullWidth color="azure" isLoading={isSubmitting}>
								<T id="login.2fa-verify" />
							</Button>
						</div>
					</Form>
				)}
			</Formik>
		</>
	);
}

function SsoButton({ ssoConfig }: { ssoConfig: SsoConfig }) {
	if (!ssoConfig.enabled) return null;
	return (
		<>
			<div className={styles.ssoDivider}>
				<span className={styles.ssoDividerText}>or</span>
			</div>
			<a href="/api/auth/sso/redirect" className={styles.ssoBtn}>
				<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
					<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
				</svg>
				<T id="login.sso-button" />
			</a>
		</>
	);
}

/** SSO callback handler — backend redirects to /#/sso-callback?payload=<base64url> */
function SsoCallbackHandler() {
	useEffect(() => {
		const hash = window.location.hash;
		if (!hash.startsWith("#/sso-callback")) return;
		const qStart = hash.indexOf("?");
		if (qStart === -1) return;
		const params = new URLSearchParams(hash.slice(qStart + 1));
		const payloadB64 = params.get("payload");
		if (!payloadB64) return;
		try {
			const raw = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
			const payload = JSON.parse(atob(raw));
			if (payload.token && payload.expires) {
				AuthStore.set({ token: payload.token, expires: payload.expires });
				window.history.replaceState(null, "", "/");
				window.location.reload();
			}
		} catch {
			window.history.replaceState(null, "", "/?sso_error=" + encodeURIComponent("Failed to process SSO response"));
			window.location.reload();
		}
	}, []);
	return null;
}

function LoginForm() {
	const emailRef = useRef<HTMLInputElement>(null);
	const [formErr, setFormErr] = useState("");
	const [ssoConfig, setSsoConfig] = useState<SsoConfig | null>(null);
	const [ssoError] = useState(() => {
		const p = new URLSearchParams(window.location.search);
		return p.get("sso_error") || "";
	});
	const { login } = useAuthState();

	useEffect(() => {
		getSsoConfig().then(setSsoConfig).catch(() => {});
	}, []);

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		setFormErr("");
		try {
			await login(values.email, values.password);
		} catch (err) {
			if (err instanceof Error) {
				setFormErr(err.message);
			}
		}
		setSubmitting(false);
	};

	useEffect(() => {
		emailRef.current?.focus();
	}, []);

	return (
		<>
			<h2 className="h2 text-center mb-4">
				<T id="login.title" />
			</h2>
			{formErr !== "" && <Alert variant="danger">{formErr}</Alert>}
			{ssoError !== "" && <Alert variant="danger">{ssoError}</Alert>}
			<Formik
				initialValues={
					{
						email: "",
						password: "",
					} as any
				}
				onSubmit={onSubmit}
			>
				{({ isSubmitting }) => (
					<Form>
						<div className="mb-3">
							<Field name="email" validate={validateEmail()}>
								{({ field, form }: any) => (
									<label className="form-label">
										<T id="email-address" />
										<input
											{...field}
											ref={emailRef}
											type="email"
											required
											className={`form-control ${form.errors.email && form.touched.email ? " is-invalid" : ""}`}
											placeholder={intl.formatMessage({ id: "email-address" })}
										/>
										<div className="invalid-feedback">{form.errors.email}</div>
									</label>
								)}
							</Field>
						</div>
						<div className="mb-2">
							<Field name="password" validate={validateString(8, 255)}>
								{({ field, form }: any) => (
									<>
										<label className="form-label">
											<T id="password" />
											<input
												{...field}
												type="password"
												autoComplete="current-password"
												required
												maxLength={255}
												className={`form-control ${form.errors.password && form.touched.password ? " is-invalid" : ""}`}
												placeholder={intl.formatMessage({ id: "password" })}
											/>
											<div className="invalid-feedback">{form.errors.password}</div>
										</label>
									</>
								)}
							</Field>
						</div>
						<div className="form-footer">
							<Button type="submit" fullWidth color="azure" isLoading={isSubmitting}>
								<T id="sign-in" />
							</Button>
						</div>
					</Form>
				)}
			</Formik>
			{ssoConfig && <SsoButton ssoConfig={ssoConfig} />}
		</>
	);
}

export default function Login() {
	const { twoFactorChallenge } = useAuthState();

	return (
		<Page className="page page-center">
			<SsoCallbackHandler />
			<div className="container container-tight py-4">
				<div className="card card-md">
					<div className="card-body">
						{twoFactorChallenge ? <TwoFactorForm /> : <LoginForm />}
					</div>
				</div>
			</div>
			<SiteFooter />
		</Page>
	);
}

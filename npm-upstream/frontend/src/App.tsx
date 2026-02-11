import { QueryClientProvider } from "@tanstack/react-query";
import EasyModal from "ez-modal-react";
import { RawIntlProvider } from "react-intl";
import { ToastContainer } from "react-toastify";
import { AuthProvider, LocaleProvider, ThemeProvider } from "src/context";
import { intl } from "src/locale";
import { queryClient } from "src/queryClient";
import Router from "src/Router.tsx";

function App() {
	return (
		<RawIntlProvider value={intl}>
			<LocaleProvider>
				<ThemeProvider>
					<QueryClientProvider client={queryClient}>
						<AuthProvider>
							<EasyModal.Provider>
								<Router />
							</EasyModal.Provider>
							<ToastContainer
								position="top-right"
								autoClose={5000}
								hideProgressBar={true}
								newestOnTop={true}
								closeOnClick={true}
								rtl={false}
								closeButton={false}
							/>
						</AuthProvider>
					</QueryClientProvider>
				</ThemeProvider>
			</LocaleProvider>
		</RawIntlProvider>
	);
}

export default App;

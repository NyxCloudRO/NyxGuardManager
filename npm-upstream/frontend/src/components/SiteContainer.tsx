interface Props {
	children: React.ReactNode;
}
export function SiteContainer({ children }: Props) {
	return (
		<div className="container-xl py-0 min-w-0 h-100 d-flex flex-column" style={{ minHeight: 0 }}>
			{children}
		</div>
	);
}

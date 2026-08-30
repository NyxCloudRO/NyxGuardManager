# NyxGuard Manager 4.0.18 container sources

Container build sources for the official NyxGuard Manager 4.0.18 images.

The Manager image starts from the immutable public 4.0.16 digest and applies
the accepted Custom Location, Threat Activity, and Developer Message release
layers. Build-time assertions verify each layer and the final 4.0.18 version
identity.

The VPN agent application is unchanged from 4.0.16. It is rebuilt from the
matching audited source and promoted under the 4.0.18 release identity so the
Manager and agent follow the established paired-tag convention.

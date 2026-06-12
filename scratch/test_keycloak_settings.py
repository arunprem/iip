from iip_core.settings import get_settings
from iip_core.keycloak import allowed_keycloak_client_ids

print("=== Base settings ===")
settings = get_settings()
print("service_name:", settings.service_name)
print("keycloak_client_id:", settings.keycloak_client_id)
print("keycloak_mobile_client_id:", settings.keycloak_mobile_client_id)
print("allowed client IDs:", allowed_keycloak_client_ids(settings))

try:
    from ml_gateway_svc.settings import get_ml_settings
    print("\n=== ML settings ===")
    ml_settings = get_ml_settings()
    print("service_name:", ml_settings.service_name)
    print("keycloak_client_id:", ml_settings.keycloak_client_id)
    print("keycloak_mobile_client_id:", ml_settings.keycloak_mobile_client_id)
    print("allowed client IDs:", allowed_keycloak_client_ids(ml_settings))
except Exception as e:
    print("Could not load ML settings:", e)

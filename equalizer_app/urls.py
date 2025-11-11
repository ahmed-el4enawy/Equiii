# equalizer_app/urls.py
from django.urls import path
from . import views

urlpatterns = [
    path("api/upload/", views.upload_signal, name="upload_signal"),
    path("api/summary/<slug:sid>/", views.summary, name="summary"),
    path("api/spectrum/<slug:sid>/", views.spectrum, name="spectrum"),
    path("api/wave_previews/<slug:sid>/", views.wave_previews, name="wave_previews"),
    path("api/spectrograms/<slug:sid>/", views.spectrograms, name="spectrograms"),
    path("api/custom_conf/<slug:sid>/", views.custom_conf, name="custom_conf"),

    path("api/equalize/<slug:sid>/", views.equalize, name="equalize"),

    path("api/save_scheme/<slug:sid>/", views.save_scheme, name="save_scheme"),
    path("api/load_scheme/<slug:sid>/", views.load_scheme, name="load_scheme"),
    path("api/save_settings/<slug:sid>/", views.save_settings, name="save_settings"),
    path("api/load_settings/<slug:sid>/", views.load_settings, name="load_settings"),

    path("api/audio/<slug:sid>/input.wav", views.audio_input, name="audio_input"),
    path("api/audio/<slug:sid>/output.wav", views.audio_output, name="audio_output"),

    path("api/ai/<slug:sid>/run/", views.ai_run, name="ai_run"),
]

import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { DatasetProvider } from "./contexts/DatasetContext";
import { ToastProvider } from "./contexts/ToastContext";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import Login from "./components/auth/Login";
import Register from "./components/auth/Register";
import LandingPage from "./pages/LandingPage";
import DatasetsPage from "./pages/DatasetsPage";
import DatasetGalleryPage from "./pages/DatasetGalleryPage";
import AnnotationPageV2 from "./pages/AnnotationPageV2";
import DocumentationPage from "./pages/DocumentationPage";
import QuantificationPage from "./pages/QuantificationPage";
import ModelZooPage from "./pages/ModelZooPage";
import ModelTrainingPage from "./pages/ModelTrainingPage";

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
      <DatasetProvider>
        <Router basename={process.env.PUBLIC_URL || ""}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/" element={<LandingPage />} />
            <Route path="/docs" element={<DocumentationPage />} />
            <Route path="/models" element={<ModelZooPage />} />
            <Route
              path="/datasets"
              element={
                <ProtectedRoute>
                  <DatasetsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dataset/:datasetId/datamanagement"
              element={
                <ProtectedRoute>
                  <DatasetGalleryPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dataset/:datasetId/datamanagement/images"
              element={
                <ProtectedRoute>
                  <DatasetGalleryPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dataset/:datasetId/datamanagement/labels"
              element={
                <ProtectedRoute>
                  <DatasetGalleryPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dataset/:datasetId/annotate"
              element={
                <ProtectedRoute>
                  <AnnotationPageV2 />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dataset/:datasetId/annotate/:imageId"
              element={
                <ProtectedRoute>
                  <AnnotationPageV2 />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dataset/:datasetId/quantifications"
              element={
                <ProtectedRoute>
                  <QuantificationPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dataset/:datasetId/training"
              element={
                <ProtectedRoute>
                  <ModelTrainingPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/annotate-v2"
              element={
                <ProtectedRoute>
                  <AnnotationPageV2 />
                </ProtectedRoute>
              }
            />
            {/* Catch-all route - redirect unknown routes to landing page */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </DatasetProvider>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;

import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { DatasetProvider } from "./contexts/DatasetContext";
import { ToastProvider } from "./contexts/ToastContext";
import { CorrectionProvider } from "./contexts/CorrectionContext";
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
import AcceptInvitePage from "./pages/AcceptInvitePage";
import AnnotationViewerPage from "./pages/AnnotationViewerPage";
import DatasetAccessPage from "./pages/DatasetAccessPage";
import AdminUsersPage from "./pages/AdminUsersPage";
import ReviewPage from "./pages/ReviewPage";
import CorrectionPage from "./pages/CorrectionPage";

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
      <DatasetProvider>
        <Router basename={process.env.PUBLIC_URL || ""}>
          <CorrectionProvider>
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
            {/* Dataset invite links land here. The page itself bounces to
                /login?next=... when the invitee is not signed in yet. */}
            <Route path="/invites/:token" element={<AcceptInvitePage />} />
            <Route
              path="/admin/users"
              element={
                <ProtectedRoute>
                  <AdminUsersPage />
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
            {/* Read-only annotation browser. Viewers cannot open an annotation
                session (the WebSocket needs annotation.create), so they are sent
                here instead of to a page that would show them nothing. */}
            <Route
              path="/dataset/:datasetId/view"
              element={
                <ProtectedRoute>
                  <AnnotationViewerPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dataset/:datasetId/view/:imageId"
              element={
                <ProtectedRoute>
                  <AnnotationViewerPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dataset/:datasetId/access"
              element={
                <ProtectedRoute>
                  <DatasetAccessPage />
                </ProtectedRoute>
              }
            />
            {/* Review queue: pick a granularity, then work through the pending
                annotations item by item. */}
            <Route
              path="/dataset/:datasetId/review"
              element={
                <ProtectedRoute>
                  <ReviewPage />
                </ProtectedRoute>
              }
            />
            {/* Correction queue: launch a session that walks the annotator through
                every sent-back instance in the editor, one at a time. */}
            <Route
              path="/dataset/:datasetId/correct"
              element={
                <ProtectedRoute>
                  <CorrectionPage />
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
          </CorrectionProvider>
        </Router>
      </DatasetProvider>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;

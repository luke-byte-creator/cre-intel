"use client";

import { useState, useEffect } from "react";

interface KillSwitchStatus {
  active: boolean;
  message: string;
  lockInfo?: {
    activatedAt: string;
    activatedBy: number;
    activatedByEmail: string;
    activatedFromIP: string;
    reason: string;
  };
}

export default function AdminSecurityPage() {
  const [killSwitchStatus, setKillSwitchStatus] = useState<KillSwitchStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionConfirmation, setActionConfirmation] = useState("");
  const [showConfirmDialog, setShowConfirmDialog] = useState<"activate" | "deactivate" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchKillSwitchStatus = async () => {
    try {
      const response = await fetch("/api/admin/killswitch");
      if (response.ok) {
        const data = await response.json();
        setKillSwitchStatus(data);
      } else {
        setError("Failed to fetch kill switch status");
      }
    } catch (err) {
      setError("Failed to connect to server");
    }
  };

  const handleKillSwitchAction = async (action: "activate" | "deactivate") => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/admin/killswitch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          confirmation: actionConfirmation,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(data.message);
        setShowConfirmDialog(null);
        setActionConfirmation("");
        await fetchKillSwitchStatus();
      } else {
        setError(data.message || data.error || "Operation failed");
      }
    } catch (err) {
      setError("Failed to execute kill switch action");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKillSwitchStatus();
    
    // Refresh status every 30 seconds
    const interval = setInterval(fetchKillSwitchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleActivateClick = () => {
    setShowConfirmDialog("activate");
    setActionConfirmation("");
    setError(null);
    setSuccess(null);
  };

  const handleDeactivateClick = () => {
    setShowConfirmDialog("deactivate");
    setActionConfirmation("");
    setError(null);
    setSuccess(null);
  };

  const styles = {
    container: {
      maxWidth: '800px',
      margin: '0 auto',
      padding: '2rem',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    },
    header: {
      marginBottom: '2rem'
    },
    title: {
      fontSize: '2.5rem',
      fontWeight: 'bold',
      marginBottom: '0.5rem',
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem'
    },
    subtitle: {
      fontSize: '1.1rem',
      color: '#666',
      marginBottom: '1.5rem'
    },
    card: {
      border: '1px solid #e2e8f0',
      borderRadius: '8px',
      padding: '1.5rem',
      marginBottom: '1.5rem',
      backgroundColor: '#fff'
    },
    badge: {
      padding: '0.25rem 0.75rem',
      borderRadius: '9999px',
      fontSize: '0.75rem',
      fontWeight: '600',
      display: 'inline-block',
      marginBottom: '0.5rem'
    },
    badgeActive: {
      backgroundColor: '#fef2f2',
      color: '#b91c1c',
      border: '1px solid #fecaca'
    },
    badgeInactive: {
      backgroundColor: '#f0fdf4',
      color: '#16a34a',
      border: '1px solid #bbf7d0'
    },
    button: {
      padding: '0.75rem 1.5rem',
      borderRadius: '6px',
      border: 'none',
      cursor: 'pointer',
      fontSize: '1rem',
      fontWeight: '600',
      width: '100%',
      marginBottom: '0.5rem',
      transition: 'all 0.2s'
    },
    buttonDanger: {
      backgroundColor: '#dc2626',
      color: 'white'
    },
    buttonSecondary: {
      backgroundColor: '#6b7280',
      color: 'white'
    },
    buttonOutline: {
      backgroundColor: 'transparent',
      color: '#374151',
      border: '1px solid #d1d5db'
    },
    alert: {
      padding: '1rem',
      borderRadius: '6px',
      marginBottom: '1rem',
      border: '1px solid'
    },
    alertError: {
      backgroundColor: '#fef2f2',
      borderColor: '#fecaca',
      color: '#b91c1c'
    },
    alertSuccess: {
      backgroundColor: '#f0fdf4',
      borderColor: '#bbf7d0',
      color: '#16a34a'
    },
    alertWarning: {
      backgroundColor: '#fffbeb',
      borderColor: '#fed7aa',
      color: '#d97706'
    },
    input: {
      width: '100%',
      padding: '0.75rem',
      border: '1px solid #d1d5db',
      borderRadius: '6px',
      fontSize: '1rem',
      marginTop: '0.5rem',
      marginBottom: '1rem'
    },
    buttonGroup: {
      display: 'flex',
      gap: '0.5rem'
    },
    lockInfo: {
      backgroundColor: '#fef2f2',
      padding: '1rem',
      borderRadius: '6px',
      marginTop: '1rem',
      fontSize: '0.875rem',
      color: '#7f1d1d'
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>
          🛡️ Security Controls
        </h1>
        <p style={styles.subtitle}>Emergency system controls for Nova Research</p>
      </div>

      {/* Status Card */}
      <div style={styles.card}>
        <h2 style={{ marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {killSwitchStatus?.active ? '🔴' : '🟢'} System Status
        </h2>
        
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <span
              style={{
                ...styles.badge,
                ...(killSwitchStatus?.active ? styles.badgeActive : styles.badgeInactive)
              }}
            >
              {killSwitchStatus?.active ? "EMERGENCY SHUTDOWN ACTIVE" : "OPERATING NORMALLY"}
            </span>
            <p style={{ margin: '0.5rem 0', color: '#666' }}>
              {killSwitchStatus?.message || "Loading..."}
            </p>
            
            {killSwitchStatus?.active && killSwitchStatus.lockInfo && (
              <div style={styles.lockInfo}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontWeight: '600' }}>Shutdown Details</h4>
                <p><strong>Activated by:</strong> {killSwitchStatus.lockInfo.activatedByEmail}</p>
                <p><strong>Time:</strong> {new Date(killSwitchStatus.lockInfo.activatedAt).toLocaleString()}</p>
                <p><strong>From IP:</strong> {killSwitchStatus.lockInfo.activatedFromIP}</p>
                <p><strong>Reason:</strong> {killSwitchStatus.lockInfo.reason}</p>
              </div>
            )}
          </div>
          
          <button
            onClick={fetchKillSwitchStatus}
            style={{...styles.button, ...styles.buttonOutline, width: 'auto', padding: '0.5rem 1rem'}}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Alert Messages */}
      {error && (
        <div style={{...styles.alert, ...styles.alertError}}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {success && (
        <div style={{...styles.alert, ...styles.alertSuccess}}>
          <strong>Success:</strong> {success}
        </div>
      )}

      {/* Kill Switch Controls */}
      <div style={{...styles.card, borderColor: killSwitchStatus?.active ? '#16a34a' : '#dc2626'}}>
        <h2 style={{ margin: '0 0 1rem 0', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          ⚠️ Emergency Controls
        </h2>
        <p style={{ marginBottom: '1.5rem', color: '#666' }}>
          Use these controls only in genuine security emergencies.
          These actions will immediately affect all users.
        </p>
        
        {!killSwitchStatus?.active ? (
          <div>
            <button
              onClick={handleActivateClick}
              style={{...styles.button, ...styles.buttonDanger}}
              disabled={loading}
            >
              🚨 EMERGENCY SHUTDOWN
            </button>
            <p style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.5rem' }}>
              This will immediately shut down Nova Research and kill the Cloudflare tunnel.
              All users will lose access until the system is restored.
            </p>
          </div>
        ) : (
          <div>
            <button
              onClick={handleDeactivateClick}
              style={{...styles.button, ...styles.buttonSecondary}}
              disabled={loading}
            >
              ✅ RESTORE SYSTEM
            </button>
            <p style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.5rem' }}>
              This will restore normal operation and allow users to access Nova Research.
            </p>
          </div>
        )}
      </div>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div style={{...styles.card, borderColor: '#dc2626', borderWidth: '2px'}}>
          <h2 style={{ margin: '0 0 1rem 0', color: '#dc2626' }}>
            {showConfirmDialog === "activate" ? "Confirm Emergency Shutdown" : "Confirm System Restoration"}
          </h2>
          <p style={{ marginBottom: '1rem', color: '#666' }}>
            {showConfirmDialog === "activate"
              ? "Are you sure you want to shut down Nova Research immediately? This action will affect all users."
              : "Are you sure you want to restore normal operation? This will re-enable user access."
            }
          </p>
          
          <div>
            <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem' }}>
              Type <strong>{showConfirmDialog === "activate" ? "SHUTDOWN" : "RESTORE"}</strong> to confirm
            </label>
            <input
              style={styles.input}
              value={actionConfirmation}
              onChange={(e) => setActionConfirmation(e.target.value)}
              placeholder={showConfirmDialog === "activate" ? "SHUTDOWN" : "RESTORE"}
            />
          </div>
          
          <div style={styles.buttonGroup}>
            <button
              onClick={() => handleKillSwitchAction(showConfirmDialog)}
              style={{
                ...styles.button,
                ...(showConfirmDialog === "activate" ? styles.buttonDanger : styles.buttonSecondary),
                width: 'auto',
                flex: 1
              }}
              disabled={
                loading ||
                (showConfirmDialog === "activate" && actionConfirmation !== "SHUTDOWN") ||
                (showConfirmDialog === "deactivate" && actionConfirmation !== "RESTORE")
              }
            >
              {loading ? "Processing..." : "Confirm"}
            </button>
            <button
              onClick={() => {
                setShowConfirmDialog(null);
                setActionConfirmation("");
              }}
              style={{...styles.button, ...styles.buttonOutline, width: 'auto', flex: 1}}
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Warning Box */}
      <div style={{...styles.alert, ...styles.alertWarning}}>
        <strong>⚠️ Security Warning:</strong>{' '}
        Only use the emergency shutdown in genuine security incidents. 
        All system activity and user access will be immediately terminated.
        The admin account password serves as the recovery authentication.
      </div>
    </div>
  );
}
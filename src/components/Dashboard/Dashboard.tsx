import React, { useRef } from 'react';
import { Layout, Model, TabNode, IJsonModel } from 'flexlayout-react';
import 'flexlayout-react/style/light.css';
import FlexTelemetryDisplay from './FlexTelemetryDisplay';
import FlexChartDisplay from './FlexChartDisplay';
import FlexMapDisplay from './FlexMapDisplay';
import FlexTrajectoryDisplay from './FlexTrajectoryDisplay';
import Flex3DDisplay from './Flex3DDisplay';
import FlexControlsPanel from './FlexControlsPanel';
import FlexCommandPanel from './FlexCommandPanel';
import FlexSimulationPanel from './FlexSimulationPanel';

const json: IJsonModel = {
  global: {
    tabEnableClose: true,
    tabEnableDrag: true,
    tabEnableRename: false,
    tabSetMinWidth: 200,
    tabSetMinHeight: 100,
  },
  borders: [],
  layout: {
    type: "row",
    weight: 100,
    children: [
      // Left side - Critical Controls
      {
        type: "tabset",
        weight: 25,
        children: [
          {
            type: "tab",
            name: "🔌 Controls",
            component: "controls"
          },
          {
            type: "tab",
            name: "🚀 Commands", 
            component: "commands"
          },
          {
            type: "tab",
            name: "🎮 Simulation",
            component: "simulation"
          }
        ]
      },
      // Middle-left - Telemetry Data
      {
        type: "tabset",
        weight: 25,
        children: [
          {
            type: "tab",
            name: "📊 Basic Data",
            component: "telemetry-basic",
            config: { sections: ['basic', 'gps'] }
          },
          {
            type: "tab", 
            name: "⚡ IMU Data",
            component: "telemetry-imu",
            config: { sections: ['imu'] }
          },
          {
            type: "tab",
            name: "🎯 Kalman Filter",
            component: "telemetry-kalman", 
            config: { sections: ['kalman'] }
          }
        ]
      },
      // Right side - Visualization
      {
        type: "row",
        weight: 50,
        children: [
          {
            type: "tabset",
            weight: 50,
            children: [
              {
                type: "tab",
                name: "📈 Charts",
                component: "charts"
              },
              {
                type: "tab",
                name: "🗺️ Map",
                component: "map"
              }
            ]
          },
          {
            type: "tabset", 
            weight: 50,
            children: [
              {
                type: "tab",
                name: "🛸 3D Trajectory",
                component: "trajectory"
              },
              {
                type: "tab",
                name: "🚀 3D Rocket",
                component: "rocket3d"
              }
            ]
          }
        ]
      }
    ]
  }
};

const Dashboard: React.FC = () => {
  const modelRef = useRef<Model | null>(null);

  React.useEffect(() => {
    modelRef.current = Model.fromJson(json);
  }, []);
  const factory = (node: TabNode) => {
    const component = node.getComponent();
    const config = node.getConfig();

    switch (component) {
      case "controls":
        return <FlexControlsPanel />;
      case "commands":
        return <FlexCommandPanel />;
      case "simulation":
        return <FlexSimulationPanel />;
      case "telemetry-basic":
        return <FlexTelemetryDisplay sections={config?.sections || ['basic']} />;
      case "telemetry-imu":
        return <FlexTelemetryDisplay sections={['imu']} />;
      case "telemetry-kalman":
        return <FlexTelemetryDisplay sections={['kalman']} />;
      case "charts":
        return <FlexChartDisplay />;
      case "map":
        return <FlexMapDisplay />;
      case "trajectory":
        return <FlexTrajectoryDisplay />;
      case "rocket3d":
        return <Flex3DDisplay />;
      default:
        return <div>Unknown component: {component}</div>;
    }
  };

  const onAction = (action: any) => {
    return action;
  };

  // Add inline styles to force tab text colors
  React.useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      .flexlayout__tab .flexlayout__tab_button,
      .flexlayout__tab_button,
      .flexlayout__tab span,
      .flexlayout__tab div {
        color: #000000 !important;
        font-weight: 600 !important;
      }
      
      .flexlayout__tab--selected .flexlayout__tab_button,
      .flexlayout__tab--selected span,
      .flexlayout__tab--selected div {
        color: #ffffff !important;
        font-weight: 700 !important;
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  if (!modelRef.current) {
    return <div>Loading Dashboard...</div>;
  }

  return (
    <div style={{ height: 'calc(100vh - 140px)', width: '100%' }}>
      <Layout
        model={modelRef.current}
        factory={factory}
        onAction={onAction}
      />
    </div>
  );
};

export default Dashboard;

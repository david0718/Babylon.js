/**
 * Describes the test suite.
 */
describe('Babylon Scene Loader', function () {
    let subject: BABYLON.Engine;

    this.timeout(10000);

    /**
     * Loads the dependencies.
     */
    before(function (done) {
        this.timeout(180000);
        (BABYLONDEVTOOLS).Loader
            .useDist()
            .load(function () {
                // Force apply promise polyfill for consistent behavior between PhantomJS, IE11, and other browsers.
                BABYLON.PromisePolyfill.Apply(true);
                done();
            });
    });

    /**
     * Create a new engine subject before each test.
     */
    beforeEach(function () {
        subject = new BABYLON.NullEngine({
            renderHeight: 256,
            renderWidth: 256,
            textureSize: 256,
            deterministicLockstep: false,
            lockstepMaxSteps: 1
        });

        // Avoid creating normals in PBR materials.
        subject.getCaps().standardDerivatives = true;
    });

    /**
     * Integration tests for loading glTF assets.
     */
    describe('#glTF', () => {
        it('Load BoomBox', () => {
            const scene = new BABYLON.Scene(subject);
            return BABYLON.SceneLoader.AppendAsync("/Playground/scenes/BoomBox/", "BoomBox.gltf", scene).then(scene => {
                expect(scene.meshes.length, "scene.meshes.length").to.equal(2);
                expect(scene.materials.length, "scene.materials.length").to.equal(1);
            });
        });

        it('Load BoomBox GLB', () => {
            const scene = new BABYLON.Scene(subject);
            return BABYLON.SceneLoader.AppendAsync("/Playground/scenes/", "BoomBox.glb", scene).then(scene => {
                expect(scene.meshes.length, "scene.meshes.length").to.equal(2);
                expect(scene.materials.length, "scene.materials.length").to.equal(1);
            });
        });

        it('Load BoomBox with ImportMesh', () => {
            const scene = new BABYLON.Scene(subject);
            return BABYLON.SceneLoader.ImportMeshAsync(null, "/Playground/scenes/BoomBox/", "BoomBox.gltf", scene).then(result => {
                expect(result.meshes.length, "meshes.length").to.equal(scene.meshes.length);
                expect(result.particleSystems.length, "particleSystems.length").to.equal(0);
                expect(result.skeletons.length, "skeletons.length").to.equal(0);
                expect(result.animationGroups.length, "animationGroups.length").to.equal(0);
            });
        });

        it('Load BoomBox with callbacks', () => {
            let parsedCount = 0;
            let meshCount = 0;
            let materialCount = 0;
            let textureCounts: { [name: string]: number } = {};
            let ready = false;

            const promises = new Array<Promise<void>>();

            BABYLON.SceneLoader.OnPluginActivatedObservable.add((loader: BABYLON.GLTFFileLoader) => {
                loader.onParsed = data => {
                    parsedCount++;
                };

                loader.onMeshLoaded = mesh => {
                    meshCount++;
                };
                loader.onMaterialLoaded = material => {
                    materialCount++;
                };
                loader.onTextureLoaded = texture => {
                    textureCounts[texture.name] = textureCounts[texture.name] || 0;
                    textureCounts[texture.name]++;
                };

                promises.push(loader.whenCompleteAsync().then(() => {
                    expect(ready, "ready").to.be.true;
                }));
            }, undefined, undefined, undefined, true);

            const scene = new BABYLON.Scene(subject);
            promises.push(BABYLON.SceneLoader.AppendAsync("/Playground/scenes/BoomBox/", "BoomBox.gltf", scene).then(() => {
                ready = true;

                expect(parsedCount, "parsedCount").to.equal(1);
                expect(meshCount, "meshCount").to.equal(scene.meshes.length);
                expect(materialCount, "materialCount").to.equal(scene.materials.length);

                const expectedTextureLoadCounts = {
                    "baseColor": 1,
                    "occlusionRoughnessMetallic": 2,
                    "normal": 1,
                    "emissive": 1
                };
                expect(Object.keys(textureCounts), "Object.keys(textureCounts)").to.have.lengthOf(Object.keys(expectedTextureLoadCounts).length);
                for (const textureName in expectedTextureLoadCounts) {
                    expect(textureCounts, "textureCounts").to.have.property(textureName, expectedTextureLoadCounts[textureName]);
                }
            }));

            return Promise.all(promises);
        });

        it('Load BoomBox with dispose', () => {
            let ready = false;
            let disposed = false;

            const promises = new Array<Promise<void>>();

            BABYLON.SceneLoader.OnPluginActivatedObservable.add((loader: BABYLON.GLTFFileLoader) => {
                loader.onDispose = () => {
                    disposed = true;
                };

                promises.push(BABYLON.Tools.DelayAsync(50).then(() => {
                    loader.dispose();
                    expect(ready, "ready").to.be.false;
                    expect(disposed, "disposed").to.be.true;
                }));
            }, undefined, undefined, undefined, true);

            const scene = new BABYLON.Scene(subject);
            promises.push(BABYLON.SceneLoader.AppendAsync("/Playground/scenes/BoomBox/", "BoomBox2.gltf", scene).then(() => {
                ready = true;
            }));

            return Promise.race(promises);
        });

        it('Load BoomBox with rootMesh.isEnabled check', () => {
            const scene = new BABYLON.Scene(subject);
            let rootMesh: BABYLON.AbstractMesh;

            subject.runRenderLoop(() => {
                if (!rootMesh) {
                    for (const mesh of scene.meshes) {
                        if (!mesh.parent) {
                            rootMesh = mesh;
                            break;
                        }
                    }
                }

                if (rootMesh) {
                    expect(rootMesh.isEnabled(), "rootMesh.isEnabled").to.be.false;
                }
            });

            return BABYLON.SceneLoader.AppendAsync("/Playground/scenes/BoomBox/", "BoomBox.gltf", scene).then(scene => {
                expect(rootMesh.isEnabled(), "rootMesh.isEnabled").to.be.true;
                subject.stopRenderLoop();
            });
        });

        it('Load CompileMaterials', () => {
            const scene = new BABYLON.Scene(subject);
            const promises = new Array<Promise<void>>();
            let createShaderProgramSpy: sinon.SinonSpy;

            subject.runRenderLoop(() => {
                for (const mesh of scene.meshes) {
                    if (mesh.material && mesh.isEnabled()) {
                        expect(mesh.material.isReady(mesh), "mesh material is ready").to.be.true;
                    }
                }
            });

            BABYLON.SceneLoader.OnPluginActivatedObservable.add((loader: BABYLON.GLTFFileLoader) => {
                loader.compileMaterials = true;

                promises.push(loader.whenCompleteAsync().then(() => {
                    const called = createShaderProgramSpy.called;
                    createShaderProgramSpy.restore();
                    expect(called, "createShaderProgramCalled").to.be.false;
                }));
            }, undefined, undefined, undefined, true);

            promises.push(BABYLON.SceneLoader.AppendAsync("http://models.babylonjs.com/Tests/CompileMaterials/", "Test.gltf", scene).then(() => {
                createShaderProgramSpy = sinon.spy(subject, "createShaderProgram");
            }));

            return Promise.all(promises);
        });

        it('Load BrainStem with compileMaterials', () => {
            const scene = new BABYLON.Scene(subject);
            const promises = new Array<Promise<void>>();
            let createShaderProgramSpy: sinon.SinonSpy;

            subject.runRenderLoop(() => {
                for (const mesh of scene.meshes) {
                    if (mesh.material && mesh.isEnabled()) {
                        expect(mesh.material.isReady(mesh), "mesh material is ready").to.be.true;
                    }
                }
            });

            BABYLON.SceneLoader.OnPluginActivatedObservable.add((loader: BABYLON.GLTFFileLoader) => {
                loader.compileMaterials = true;

                promises.push(loader.whenCompleteAsync().then(() => {
                    const called = createShaderProgramSpy.called;
                    createShaderProgramSpy.restore();
                    expect(called, "createShaderProgramCalled").to.be.false;
                }));
            }, undefined, undefined, undefined, true);

            promises.push(BABYLON.SceneLoader.AppendAsync("/Playground/scenes/BrainStem/", "BrainStem.gltf", scene).then(() => {
                createShaderProgramSpy = sinon.spy(subject, "createShaderProgram");
            }));

            return Promise.all(promises);
        });

        it('Load Alien', () => {
            const scene = new BABYLON.Scene(subject);
            return BABYLON.SceneLoader.ImportMeshAsync(null, "/Playground/scenes/Alien/", "Alien.gltf", scene).then(result => {
                const skeletonsMapping = {
                    "AlienHead": "skeleton0",
                    "Collar": "skeleton1",
                    "LeftEye": "skeleton2",
                    "RightEye": "skeleton3",
                    "CollarClasp": "skeleton1",
                    "Shirt": "skeleton1",
                    "ShirtPlate": "skeleton1",
                    "Teeth": "skeleton1",
                };

                expect(scene.skeletons, "scene.skeletons").to.have.lengthOf(4);
                expect(result.skeletons, "skeletons").to.have.lengthOf(4);

                for (const meshName in skeletonsMapping) {
                    const skeletonName = skeletonsMapping[meshName];
                    expect(scene.getMeshByName(meshName).skeleton.name, `skeleton name of mesh '${meshName}'`).to.equal(skeletonName);
                }

                const alienHeadMesh = scene.getMeshByName("AlienHead") as BABYLON.Mesh;
                expect(alienHeadMesh.morphTargetManager.numTargets, "alienHeadMesh.morphTargetManager.numTargets").to.equal(2);

                expect(scene.animationGroups, "scene.animationGroups").to.have.lengthOf(1);
                expect(result.animationGroups, "animationGroups").to.have.lengthOf(1);

                const animationGroup = result.animationGroups[0];
                expect(animationGroup.name, "animationGroup.name").to.equal("TwoTargetBlend");
                expect(animationGroup.targetedAnimations, "animationGroup.targetedAnimations").to.have.lengthOf(7);
                const influenceAnimations = animationGroup.targetedAnimations.filter(_ => _.animation.targetProperty === "influence");
                expect(influenceAnimations, "influenceAnimations").to.have.lengthOf(2);
                const rotationAnimations = animationGroup.targetedAnimations.filter(_ => _.animation.targetProperty === "rotationQuaternion");
                expect(rotationAnimations, "rotationAnimations").to.have.lengthOf(4);
                const positionAnimations = animationGroup.targetedAnimations.filter(_ => _.animation.targetProperty === "position");
                expect(positionAnimations, "positionAnimations").to.have.lengthOf(1);
            });
        });

        it('Load TwoQuads with LODs', () => {
            const scene = new BABYLON.Scene(subject);
            const promises = new Array<Promise<void>>();

            subject.runRenderLoop(() => {
                for (const mesh of scene.meshes) {
                    if (mesh.material && mesh.isEnabled()) {
                        expect(mesh.material.isReady(mesh), "mesh material is ready").to.be.true;
                    }
                }
            });

            BABYLON.SceneLoader.OnPluginActivatedObservable.add((loader: BABYLON.GLTFFileLoader) => {
                loader.compileMaterials = true;

                promises.push(loader.whenCompleteAsync().then(() => {
                    const meshes = [
                        scene.getMeshByName("node0"),
                        scene.getMeshByName("node1")
                    ];

                    expect(meshes[0].material.name, "Material for node 0").to.equal("LOD0");
                    expect(meshes[1].material.name, "Material for node 1").to.equal("LOD0");

                    expect(scene.materials, "scene.materials").to.have.lengthOf(1);
                    const materials = [
                        scene.getMaterialByName("LOD0")
                    ];

                    expect(materials[0].isReady(meshes[0]), "Material of LOD 0 is ready for node 0").to.be.true;
                    expect(materials[0].isReady(meshes[1]), "Material of LOD 0 is ready for node 1").to.be.true;
                }));
            }, undefined, undefined, undefined, true);

            promises.push(BABYLON.SceneLoader.AppendAsync("http://models.babylonjs.com/Tests/TwoQuads/", "TwoQuads.gltf", scene).then(() => {
                const meshes = [
                    scene.getMeshByName("node0"),
                    scene.getMeshByName("node1")
                ];

                expect(meshes[0].material.name, "Material for node 0").to.equal("LOD2");
                expect(meshes[1].material.name, "Material for node 1").to.equal("LOD2");

                expect(scene.materials, "scene.materials").to.have.lengthOf(3);
                const materials = [
                    scene.getMaterialByName("LOD0"),
                    scene.getMaterialByName("LOD1"),
                    scene.getMaterialByName("LOD2")
                ];

                expect(materials[0].isReady(meshes[0]), "Material of LOD 0 is ready for node 0").to.be.false;
                expect(materials[0].isReady(meshes[1]), "Material of LOD 0 is ready for node 1").to.be.false;
                expect(materials[1].isReady(meshes[0]), "Material of LOD 1 is ready for node 0").to.be.false;
                expect(materials[1].isReady(meshes[1]), "Material of LOD 1 is ready for node 1").to.be.false;
                expect(materials[2].isReady(meshes[0]), "Material of LOD 2 is ready for node 0").to.be.true;
                expect(materials[2].isReady(meshes[1]), "Material of LOD 2 is ready for node 1").to.be.true;
            }));

            return Promise.all(promises);
        });

        it('Load MultiPrimitive', () => {
            const scene = new BABYLON.Scene(subject);
            return BABYLON.SceneLoader.ImportMeshAsync(null, "http://models.babylonjs.com/Tests/MultiPrimitive/", "MultiPrimitive.gltf", scene).then(result => {
                expect(result.meshes, "meshes").to.have.lengthOf(4);

                const node = scene.getMeshByName("node");
                expect(node, "node").to.exist;
                expect(node, "node").to.be.an.instanceof(BABYLON.Mesh);

                const mesh = node as BABYLON.Mesh;
                expect(mesh.geometry).to.not.exist;
                expect(mesh.material).to.not.exist;

                expect(mesh.getChildren(), "mesh children").to.have.lengthOf(2);
                for (const childNode of mesh.getChildren()) {
                    expect(childNode, "child node").to.be.an.instanceof(BABYLON.Mesh);
                    const childMesh = childNode as BABYLON.Mesh;
                    expect(childMesh.geometry).to.exist;
                    expect(childMesh.material).to.exist;
                }
            });
        });

        it('Load BrainStem', () => {
            const scene = new BABYLON.Scene(subject);
            return BABYLON.SceneLoader.ImportMeshAsync(null, "/Playground/scenes/BrainStem/", "BrainStem.gltf", scene).then(result => {
                expect(result.skeletons, "skeletons").to.have.lengthOf(1);

                const node1 = scene.getMeshByName("node1");
                for (const childMesh of node1.getChildMeshes()) {
                    expect(childMesh.skeleton, "mesh skeleton").to.exist;
                    expect(childMesh.skeleton.name, "mesh skeleton name").to.equal(result.skeletons[0].name);
                }
            });
        });

        it('Load BoomBox with transparencyAsCoverage', () => {
            const scene = new BABYLON.Scene(subject);

            const promises = new Array<Promise<any>>();

            BABYLON.SceneLoader.OnPluginActivatedObservable.add((loader: BABYLON.GLTFFileLoader) => {
                var specularOverAlpha = false;
                var radianceOverAlpha = false;

                loader.transparencyAsCoverage = true;
                loader.onMaterialLoaded = material => {
                    specularOverAlpha = specularOverAlpha || (material as BABYLON.PBRMaterial).useSpecularOverAlpha;
                    radianceOverAlpha = radianceOverAlpha || (material as BABYLON.PBRMaterial).useRadianceOverAlpha;
                };
                promises.push(loader.whenCompleteAsync().then(() => {
                    expect(specularOverAlpha, "specularOverAlpha").to.be.false;
                    expect(radianceOverAlpha, "radianceOverAlpha").to.be.false;
                }));
            }, undefined, undefined, undefined, true);

            promises.push(BABYLON.SceneLoader.AppendAsync("/Playground/scenes/BoomBox/", "BoomBox.gltf", scene));
            return Promise.all(promises);
        });

        it('Load BoomBox without transparencyAsCoverage', () => {
            const scene = new BABYLON.Scene(subject);

            const promises = new Array<Promise<any>>();

            BABYLON.SceneLoader.OnPluginActivatedObservable.add((loader: BABYLON.GLTFFileLoader) => {
                var specularOverAlpha = true;
                var radianceOverAlpha = true;

                loader.transparencyAsCoverage = false;
                loader.onMaterialLoaded = material => {
                    specularOverAlpha = specularOverAlpha && (material as BABYLON.PBRMaterial).useSpecularOverAlpha;
                    radianceOverAlpha = radianceOverAlpha && (material as BABYLON.PBRMaterial).useRadianceOverAlpha;
                };
                promises.push(loader.whenCompleteAsync().then(() => {
                    expect(specularOverAlpha, "specularOverAlpha").to.be.true;
                    expect(radianceOverAlpha, "radianceOverAlpha").to.be.true;
                }));
            }, undefined, undefined, undefined, true);

            promises.push(BABYLON.SceneLoader.AppendAsync("/Playground/scenes/BoomBox/", "BoomBox.gltf", scene));
            return Promise.all(promises);
        });

        // TODO: test animation group callback
        // TODO: test material instancing
        // TODO: test ImportMesh with specific node name
        // TODO: test KHR_materials_pbrSpecularGlossiness
        // TODO: test KHR_lights
    });

    describe('#AssetContainer', () => {
        it('should be loaded from BoomBox GLTF', () => {
            var scene = new BABYLON.Scene(subject);
            return BABYLON.SceneLoader.LoadAssetContainerAsync("/Playground/scenes/BoomBox/", "BoomBox.gltf", scene).then(container => {
                expect(container.meshes.length).to.eq(2);
            });
        });
        it('should be adding and removing objects from scene', () => {
            // Create a scene with some assets
            var scene = new BABYLON.Scene(subject);
            var camera = new BABYLON.FreeCamera("camera1", new BABYLON.Vector3(0, 5, -10), scene);
            var light = new BABYLON.HemisphericLight("light1", new BABYLON.Vector3(0, 1, 0), scene);
            var sphere = BABYLON.Mesh.CreateSphere("sphere1", 16, 2, scene);
            var ground = BABYLON.Mesh.CreateGround("ground1", 6, 6, 2, scene);

            // Move all the assets from the scene into a container
            var container = new BABYLON.AssetContainer(scene);
            var keepAssets = new BABYLON.KeepAssets();
            keepAssets.cameras.push(camera);
            container.moveAllFromScene(keepAssets);
            expect(scene.cameras.length).to.eq(1);
            expect(scene.meshes.length).to.eq(0);
            expect(scene.lights.length).to.eq(0);
            expect(container.cameras.length).to.eq(0);
            expect(container.meshes.length).to.eq(2);
            expect(container.lights.length).to.eq(1);

            // Add them back and then remove again
            container.addAllToScene();
            expect(scene.cameras.length).to.eq(1);
            expect(scene.meshes.length).to.eq(2);
            expect(scene.lights.length).to.eq(1);
            container.removeAllFromScene();
            expect(scene.cameras.length).to.eq(1);
            expect(scene.meshes.length).to.eq(0);
            expect(scene.lights.length).to.eq(0);
        });
    });
});
